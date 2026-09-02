import { describe, it, expect } from "vitest";
import { applyTargetedRefinementDecision, bumpRefinementCounters, type RefinementCounters } from "./processSubmission";

/**
 * Regression coverage for a real bug caught in independent review
 * (2026-09-02): propertyRefinementRound/rentRefinementRound must be per-
 * round decisions, not monotonically-increasing counters that only ever go
 * up. A target whose gate check passes has to have its counter reset back
 * to 0 so the *next* round calls it with refinementRound 0 (letting it hit
 * its own 30-day cache) instead of a stale nonzero value that makes it
 * needlessly bypass its cache and rerun a live, broadened search.
 *
 * Each test drives the exact two functions processSubmission.ts and
 * runJobAttempt call every round (applyTargetedRefinementDecision right
 * after the gate is evaluated, bumpRefinementCounters right after a round
 * comes back "needs_confidence_retry") directly against a plain counters
 * object, mirroring how they're actually invoked without needing to mock
 * the research calls, email, Stripe, or PDF/XLSX generation.
 */

function freshCounters(): RefinementCounters {
  return {
    propertyRefinementRound: 0,
    rentRefinementRound: 0,
    pendingPropertyRefinement: false,
    pendingRentRefinement: false,
  };
}

/** One full round: gate result comes in, decision is recorded, then (since this suite only exercises the "still retrying" path) the counters are bumped the same way runJobAttempt does. */
function runRound(counters: RefinementCounters, gate: { needsPropertyRefinement: boolean; needsRentRefinement: boolean }): void {
  applyTargetedRefinementDecision(counters, gate);
  bumpRefinementCounters(counters);
}

describe("targeted confidence-refinement counters", () => {
  it("increments both counters when both sides fail on round 0", () => {
    const counters = freshCounters();
    runRound(counters, { needsPropertyRefinement: true, needsRentRefinement: true });
    expect(counters.propertyRefinementRound).toBe(1);
    expect(counters.rentRefinementRound).toBe(1);
  });

  it("only bumps the side that actually failed, leaving the other at 0", () => {
    const counters = freshCounters();
    runRound(counters, { needsPropertyRefinement: false, needsRentRefinement: true });
    expect(counters.propertyRefinementRound).toBe(0);
    expect(counters.rentRefinementRound).toBe(1);
  });

  it("REGRESSION: resets a recovered side's counter to 0 instead of leaving it stale, across a mixed multi-round sequence", () => {
    const counters = freshCounters();

    // Round 0: both property and rent fail the gate — both get a broadened
    // retry, both counters go to 1.
    runRound(counters, { needsPropertyRefinement: true, needsRentRefinement: true });
    expect(counters.propertyRefinementRound).toBe(1);
    expect(counters.rentRefinementRound).toBe(1);

    // Round 1 (run with propertyRefinementRound=1, rentRefinementRound=1 as
    // computed above): property now passes, rent still fails. Before the
    // fix, propertyRefinementRound stayed at 1 forever from here on — this
    // is exactly the reviewer's reproduction.
    runRound(counters, { needsPropertyRefinement: false, needsRentRefinement: true });
    expect(counters.propertyRefinementRound).toBe(0); // reset — property's next call gets refinementRound 0 and hits its cache
    expect(counters.rentRefinementRound).toBe(2); // rent keeps failing, so its broadened search keeps widening

    // Round 2: property is called with refinementRound 0 this round (proven
    // by the assertion above) — it must stay reset even through another
    // round where only rent is retried, not just for one round after it
    // recovers.
    runRound(counters, { needsPropertyRefinement: false, needsRentRefinement: true });
    expect(counters.propertyRefinementRound).toBe(0);
    expect(counters.rentRefinementRound).toBe(3);
  });

  it("REGRESSION: a side that fails again after recovering starts broadening from 1, not from its old stale count", () => {
    const counters = freshCounters();

    runRound(counters, { needsPropertyRefinement: true, needsRentRefinement: true }); // both -> 1
    runRound(counters, { needsPropertyRefinement: false, needsRentRefinement: true }); // property recovers -> reset to 0, rent -> 2
    expect(counters.propertyRefinementRound).toBe(0);

    // Property fails again on a later round (e.g. its search regressed) —
    // it should broaden from a fresh 1, not resume from the old value of 1
    // it happened to have before (which would look identical here, but
    // matters once more rounds stack up — this asserts the reset actually
    // took effect rather than the value coincidentally being unchanged).
    runRound(counters, { needsPropertyRefinement: true, needsRentRefinement: false });
    expect(counters.propertyRefinementRound).toBe(1);
    expect(counters.rentRefinementRound).toBe(0); // rent, in turn, is now reset
  });

  it("pending flags always mirror the gate's verdict from the most recent round", () => {
    const counters = freshCounters();
    applyTargetedRefinementDecision(counters, { needsPropertyRefinement: true, needsRentRefinement: false });
    expect(counters.pendingPropertyRefinement).toBe(true);
    expect(counters.pendingRentRefinement).toBe(false);

    applyTargetedRefinementDecision(counters, { needsPropertyRefinement: false, needsRentRefinement: true });
    expect(counters.pendingPropertyRefinement).toBe(false);
    expect(counters.pendingRentRefinement).toBe(true);
  });
});
