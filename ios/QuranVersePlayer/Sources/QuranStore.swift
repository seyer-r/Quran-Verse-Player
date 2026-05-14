import Foundation

@Observable
class QuranStore {
    var surahs: [Surah] = []
    var isLoaded = false

    init() {
        Task.detached(priority: .userInitiated) {
            let loaded = Self.load()
            await MainActor.run {
                self.surahs = loaded
                self.isLoaded = true
            }
        }
    }

    private static func load() -> [Surah] {
        guard let url = Bundle.main.url(forResource: "quran", withExtension: "json"),
              let data = try? Data(contentsOf: url)
        else { return [] }
        return (try? JSONDecoder().decode([Surah].self, from: data)) ?? []
    }
}
