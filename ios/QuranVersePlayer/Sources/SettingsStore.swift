import Foundation

@Observable
class SettingsStore {
    var reciterId: String {
        didSet { UserDefaults.standard.set(reciterId, forKey: "reciterId") }
    }
    var repeatMode: RepeatMode {
        didSet { UserDefaults.standard.set(repeatMode.rawValue, forKey: "repeatMode") }
    }
    var autoplayNext: Bool {
        didSet { UserDefaults.standard.set(autoplayNext, forKey: "autoplayNext") }
    }
    var ambientSound: AmbientSound {
        didSet { UserDefaults.standard.set(ambientSound.rawValue, forKey: "ambientSound") }
    }
    var ambientVolume: Float {
        didSet { UserDefaults.standard.set(ambientVolume, forKey: "ambientVolume") }
    }
    var arabicFontSize: CGFloat {
        didSet { UserDefaults.standard.set(arabicFontSize, forKey: "arabicFontSize") }
    }
    var showTranslation: Bool {
        didSet { UserDefaults.standard.set(showTranslation, forKey: "showTranslation") }
    }
    var bookmarkedAyahs: Set<Int> {
        didSet {
            UserDefaults.standard.set(Array(bookmarkedAyahs), forKey: "bookmarks")
        }
    }

    var selectedReciter: Reciter {
        allReciters.first { $0.id == reciterId } ?? allReciters[0]
    }

    init() {
        let ud = UserDefaults.standard
        reciterId      = ud.string(forKey: "reciterId") ?? "alafasy"
        repeatMode     = RepeatMode(rawValue: ud.string(forKey: "repeatMode") ?? "") ?? .off
        autoplayNext   = ud.object(forKey: "autoplayNext") as? Bool ?? true
        ambientSound   = AmbientSound(rawValue: ud.string(forKey: "ambientSound") ?? "") ?? .none
        ambientVolume  = ud.object(forKey: "ambientVolume") as? Float ?? 0.4
        arabicFontSize = ud.object(forKey: "arabicFontSize") as? CGFloat ?? 32
        showTranslation = ud.object(forKey: "showTranslation") as? Bool ?? true
        bookmarkedAyahs = Set(ud.array(forKey: "bookmarks") as? [Int] ?? [])
    }

    func toggleBookmark(globalNumber: Int) {
        if bookmarkedAyahs.contains(globalNumber) {
            bookmarkedAyahs.remove(globalNumber)
        } else {
            bookmarkedAyahs.insert(globalNumber)
        }
    }
}
