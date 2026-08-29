import { View, Text, StyleSheet } from "@react-pdf/renderer";

export const NAVY = "#0A1F44";
export const RED = "#C8102E";
export const GREY = "#595959";

export const sharedStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  title: { fontSize: 18, fontWeight: 700, color: NAVY, textAlign: "center" },
  subtitle: { fontSize: 10, color: GREY, textAlign: "center", marginTop: 4, marginBottom: 16 },
  hr: { borderBottomWidth: 1, borderBottomColor: NAVY, marginBottom: 16 },
  h2: { fontSize: 13, fontWeight: 700, color: NAVY, marginTop: 18, marginBottom: 8 },
  h2Num: { color: RED },
  p: { fontSize: 9.5, lineHeight: 1.5, color: "#222", marginBottom: 6 },
  table: { borderWidth: 1, borderColor: "#ddd", marginBottom: 6 },
  rowHeader: { flexDirection: "row", backgroundColor: NAVY },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#eee" },
  rowAlt: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#eee", backgroundColor: "#fafafa" },
  cellHeaderL: { flex: 1, padding: 6, fontSize: 9, fontWeight: 700, color: "#fff" },
  cellHeaderR: { flex: 1.4, padding: 6, fontSize: 9, fontWeight: 700, color: "#fff" },
  cellL: { flex: 1, padding: 6, fontSize: 9, color: "#222" },
  cellR: { flex: 1.4, padding: 6, fontSize: 9, color: "#222" },
  footer: { fontSize: 8, color: GREY, marginTop: 20, borderTopWidth: 1, borderTopColor: "#ddd", paddingTop: 8 },
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
