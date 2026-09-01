import { View, Text, StyleSheet, Svg, Rect } from "@react-pdf/renderer";

export const NAVY = "#0A1F44";
export const RED = "#C8102E";
export const GREY = "#595959";
export const GREEN = "#1E7A3C";
export const NAVY_TINT = "#EEF1F6";

export const sharedStyles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: "#111" },

  // Letterhead / header band — kicker + big title, used on every document.
  kicker: { fontSize: 8, fontWeight: 700, color: NAVY, letterSpacing: 2, textAlign: "center" },
  title: { fontSize: 19, fontWeight: 700, color: NAVY, textAlign: "center", marginTop: 4 },
  subtitle: { fontSize: 9.5, color: GREY, textAlign: "center", marginTop: 4, marginBottom: 14 },
  hr: { borderBottomWidth: 2, borderBottomColor: NAVY, marginBottom: 18 },

  // Section headings — a filled numbered badge instead of plain colored text.
  h2Row: { flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 8 },
  h2Badge: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: NAVY,
    alignItems: "center", justifyContent: "center", marginRight: 8,
  },
  h2BadgeText: { fontSize: 9, fontWeight: 700, color: "#fff" },
  h2: { fontSize: 12.5, fontWeight: 700, color: NAVY },
  h2Num: { color: RED },
  p: { fontSize: 9.5, lineHeight: 1.5, color: "#222", marginBottom: 6 },

  table: { borderWidth: 1, borderColor: "#ddd", marginBottom: 6, borderRadius: 2 },
  rowHeader: { flexDirection: "row", backgroundColor: NAVY },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#eee" },
  rowAlt: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#eee", backgroundColor: "#fafafa" },
  cellHeaderL: { flex: 1, padding: 6, fontSize: 9, fontWeight: 700, color: "#fff" },
  cellHeaderR: { flex: 1.4, padding: 6, fontSize: 9, fontWeight: 700, color: "#fff" },
  cellL: { flex: 1, padding: 6, fontSize: 9, color: "#222" },
  cellR: { flex: 1.4, padding: 6, fontSize: 9, color: "#222" },

  // Fixed running footer, repeated on every page via react-pdf's `fixed` prop.
  footerFixed: {
    position: "absolute", bottom: 24, left: 40, right: 40,
    borderTopWidth: 1, borderTopColor: "#ddd", paddingTop: 6,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerFixedText: { fontSize: 7.5, color: GREY },
  footer: { fontSize: 8, color: GREY, marginTop: 20, borderTopWidth: 1, borderTopColor: "#ddd", paddingTop: 8 },

  // "At a glance" stat strip.
  statRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: NAVY_TINT, borderRadius: 3, padding: 10, borderWidth: 1, borderColor: "#DCE2ED" },
  statLabel: { fontSize: 7, fontWeight: 700, color: GREY, letterSpacing: 1 },
  statValue: { fontSize: 15, fontWeight: 700, color: NAVY, marginTop: 4 },
});

export function Table({ rows, headers }: { rows: [string, string][]; headers?: [string, string] }) {
  return (
    <View style={sharedStyles.table}>
      <View style={sharedStyles.rowHeader}>
        <Text style={sharedStyles.cellHeaderL}>{headers?.[0] ?? "Item"}</Text>
        <Text style={sharedStyles.cellHeaderR}>{headers?.[1] ?? "Detail"}</Text>
      </View>
      {rows.map(([label, value], i) => (
        <View key={label} style={i % 2 === 0 ? sharedStyles.row : sharedStyles.rowAlt}>
          <Text style={sharedStyles.cellL}>{label}</Text>
          <Text style={sharedStyles.cellR}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Small letterhead block — company name + document title — identical across every generated document. */
export function Letterhead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View>
      <Text style={sharedStyles.kicker}>GARRISON RISK REVIEW &middot; INDEPENDENT UNDERWRITING</Text>
      <Text style={sharedStyles.title}>{title}</Text>
      <Text style={sharedStyles.subtitle}>{subtitle}</Text>
      <View style={sharedStyles.hr} />
    </View>
  );
}

/** Numbered section heading with a filled circular badge instead of plain colored text. */
export function SectionHeading({ n, title }: { n: number; title: string }) {
  return (
    <View style={sharedStyles.h2Row}>
      <View style={sharedStyles.h2Badge}>
        <Text style={sharedStyles.h2BadgeText}>{n}</Text>
      </View>
      <Text style={sharedStyles.h2}>{title}</Text>
    </View>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" | "navy" }) {
  const color = tone === "red" ? RED : tone === "green" ? GREEN : NAVY;
  return (
    <View style={sharedStyles.statCard}>
      <Text style={sharedStyles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[sharedStyles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

/** Fixed footer repeated on every page — reference/address on the left, page X of Y on the right. */
export function RunningFooter({ leftText }: { leftText: string }) {
  return (
    <View style={sharedStyles.footerFixed} fixed>
      <Text style={sharedStyles.footerFixedText}>{leftText}</Text>
      <Text
        style={sharedStyles.footerFixedText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

/**
 * Two-bar comparison chart (rent after vacancy vs. total monthly cost) drawn
 * with plain SVG rects — no charting library, keeps the render dependency-free.
 * Both bars share one scale so the visual gap directly represents the
 * monthly cash-flow margin (or shortfall) reported in the text above it.
 */
export function CashFlowBarChart({ rentAfterVacancy, totalMonthlyCost }: { rentAfterVacancy: number; totalMonthlyCost: number }) {
  const width = 480;
  const barHeight = 22;
  const gap = 14;
  const labelWidth = 130;
  const maxValue = Math.max(rentAfterVacancy, totalMonthlyCost, 1);
  const trackWidth = width - labelWidth;
  const rentBarWidth = (rentAfterVacancy / maxValue) * trackWidth;
  const costBarWidth = (totalMonthlyCost / maxValue) * trackWidth;
  const costOverflows = totalMonthlyCost > rentAfterVacancy;

  return (
    <Svg width={width} height={barHeight * 2 + gap} style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 8, fontWeight: 700 }} x={0} y={barHeight / 2 + 3}>
        Rent (after vacancy)
      </Text>
      <Rect x={labelWidth} y={2} width={trackWidth} height={barHeight - 4} fill="#EEF1F6" />
      <Rect x={labelWidth} y={2} width={rentBarWidth} height={barHeight - 4} fill={GREEN} />

      <Text style={{ fontSize: 8, fontWeight: 700 }} x={0} y={barHeight + gap + barHeight / 2 + 3}>
        Total cost + reserves
      </Text>
      <Rect x={labelWidth} y={barHeight + gap + 2} width={trackWidth} height={barHeight - 4} fill="#EEF1F6" />
      <Rect
        x={labelWidth}
        y={barHeight + gap + 2}
        width={costBarWidth}
        height={barHeight - 4}
        fill={costOverflows ? RED : GREY}
      />
    </Svg>
  );
}
