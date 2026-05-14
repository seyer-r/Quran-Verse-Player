import SwiftUI

struct SurahPickerView: View {
    let surahs: [Surah]
    @Binding var selectedSurahIndex: Int
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    var filtered: [Surah] {
        guard !search.isEmpty else { return surahs }
        return surahs.filter {
            $0.nameLatin.localizedCaseInsensitiveContains(search) ||
            $0.nameArabic.contains(search) ||
            String($0.number).hasPrefix(search)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(colors: [.indigo.opacity(0.9), .purple.opacity(0.8)],
                               startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()

                List(filtered) { surah in
                    Button {
                        selectedSurahIndex = surah.number - 1
                        dismiss()
                    } label: {
                        HStack {
                            Text("\(surah.number)")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.white.opacity(0.6))
                                .frame(width: 30, alignment: .trailing)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(surah.nameLatin)
                                    .foregroundStyle(.white)
                                    .font(.body.weight(.medium))
                                Text(surah.meaning)
                                    .foregroundStyle(.white.opacity(0.6))
                                    .font(.caption)
                            }

                            Spacer()

                            Text(surah.nameArabic)
                                .font(.custom("AmiriQuran", size: 16))
                                .foregroundStyle(.white.opacity(0.85))
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(Color.white.opacity(0.07))
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .searchable(text: $search, prompt: "Search surahs…")
            }
            .navigationTitle("Select Surah")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.white)
                }
            }
        }
    }
}
