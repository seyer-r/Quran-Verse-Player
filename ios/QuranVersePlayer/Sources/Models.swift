import Foundation

struct Ayah: Codable, Identifiable, Equatable {
    let number: Int
    let globalNumber: Int
    let arabic: String
    let translation: String
    var id: Int { globalNumber }
}

struct Surah: Codable, Identifiable {
    let number: Int
    let nameArabic: String
    let nameLatin: String
    let meaning: String
    let revelationType: String
    let ayahCount: Int
    let ayahs: [Ayah]
    var id: Int { number }
}

struct Reciter: Identifiable, Equatable {
    let id: String
    let name: String
    let cdnIdentifier: String

    func audioURL(for ayah: Ayah) -> URL? {
        URL(string: "https://cdn.islamic.network/quran/audio/128/\(cdnIdentifier)/\(ayah.globalNumber).mp3")
    }
}

let allReciters: [Reciter] = [
    Reciter(id: "alafasy",  name: "Mishary Rashid Alafasy",        cdnIdentifier: "ar.alafasy"),
    Reciter(id: "hudhaify", name: "Ali Al-Hudhaify",               cdnIdentifier: "ar.hudhaify"),
    Reciter(id: "maher",    name: "Maher Al-Muaiqly",              cdnIdentifier: "ar.mahermuaiqly"),
    Reciter(id: "shatri",   name: "Abu Bakr Al-Shatri",            cdnIdentifier: "ar.shaatree"),
    Reciter(id: "husary",   name: "Mahmoud Khalil Al-Hussary",     cdnIdentifier: "ar.husary"),
]

enum AmbientSound: String, CaseIterable, Identifiable {
    case none   = "none"
    case rain   = "rain"
    case ocean  = "ocean"
    case forest = "forest"
    case night  = "night"
    case wind   = "wind"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .none:   return "None"
        case .rain:   return "Rain"
        case .ocean:  return "Ocean"
        case .forest: return "Forest"
        case .night:  return "Night"
        case .wind:   return "Wind"
        }
    }
    var filename: String? {
        self == .none ? nil : "\(rawValue).mp3"
    }
}

enum RepeatMode: String, CaseIterable {
    case off   = "off"
    case ayah  = "ayah"
    case surah = "surah"
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
