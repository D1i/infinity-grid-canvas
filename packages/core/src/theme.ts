/** Colors the renderer uses. Values follow the product's gray/indigo token scale. */
export interface Theme {
  background: string;
  gridLine: string;
  gridLineStrong: string;
  rowStripe: string;
  item: string;
  itemBorder: string;
  itemHover: string;
  itemText: string;
  itemMuted: string;
  itemSelected: string;
  itemSelectedBg: string;
  glyph: string;
  glyphBg: string;
  predict: string;
  predictBorder: string;
  predictInvalid: string;
  predictInvalidBorder: string;
  shifted: string;
  gear: string;
  gearBg: string;
  required: string;
  shadow: string;
  font: string;
}

export const lightTheme: Theme = {
  background: "#f9fafb", // gray-50
  gridLine: "#eaecf0", // gray-200
  gridLineStrong: "#d0d5dd", // gray-300
  rowStripe: "#fcfcfd", // gray-25
  item: "#ffffff",
  itemBorder: "#d0d5dd",
  itemHover: "#f5f8ff", // indigo-25
  itemText: "#101828", // gray-900
  itemMuted: "#667085", // gray-500
  itemSelected: "#444ce7", // indigo-600
  itemSelectedBg: "#eef4ff", // indigo-50
  glyph: "#444ce7",
  glyphBg: "#e0eaff", // indigo-100
  predict: "rgba(97, 114, 243, 0.14)", // indigo-500
  predictBorder: "#6172f3",
  predictInvalid: "rgba(240, 68, 56, 0.12)", // error-500
  predictInvalidBorder: "#f97066", // error-400
  shifted: "rgba(97, 114, 243, 0.08)",
  gear: "#344054", // gray-700
  gearBg: "#ffffff",
  required: "#ee5454",
  shadow: "rgba(16, 24, 40, 0.10)",
  font: '"Roboto", "Segoe UI", Helvetica, Arial, sans-serif'
};

export const darkTheme: Theme = {
  background: "#101828", // gray-900
  gridLine: "#1d2939", // gray-800
  gridLineStrong: "#344054", // gray-700
  rowStripe: "#131c2e",
  item: "#1d2939",
  itemBorder: "#344054",
  itemHover: "#243047",
  itemText: "#f2f4f7",
  itemMuted: "#98a2b3",
  itemSelected: "#8098f9", // indigo-400
  itemSelectedBg: "#1f2550",
  glyph: "#a4bcfd", // indigo-300
  glyphBg: "#2d31a6", // indigo-800
  predict: "rgba(128, 152, 249, 0.18)",
  predictBorder: "#8098f9",
  predictInvalid: "rgba(249, 112, 102, 0.16)",
  predictInvalidBorder: "#f97066",
  shifted: "rgba(128, 152, 249, 0.10)",
  gear: "#eaecf0",
  gearBg: "#344054",
  required: "#f97066",
  shadow: "rgba(0, 0, 0, 0.35)",
  font: '"Roboto", "Segoe UI", Helvetica, Arial, sans-serif'
};
