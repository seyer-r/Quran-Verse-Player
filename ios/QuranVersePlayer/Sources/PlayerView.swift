import SwiftUI

struct PlayerView: View {
    @State private var store = QuranStore()
    @State private var settings = SettingsStore()
    @State private var audio = AudioPlayer()
    @State private var ambient = AmbientPlayer()

    @State private var surahIndex = 0
    @State private var ayahIndex = 0
    @State private var showSurahPicker = false
    @State private var showSettings = false
    @State private var sleepTimer: Timer?
    @State private var sleepMinutes: Int? = nil

    var currentSurah: Surah? { store.surahs[safe: surahIndex] }
    var currentAyah: Ayah?  { currentSurah?.ayahs[safe: ayahIndex] }

    var body: some View {
        ZStack {
            background

            if !store.isLoaded {
                loadingView
            } else {
                mainContent
            }
        }
        .ignoresSafeArea()
        .onAppear {
            if settings.ambientSound != .none {
                ambient.play(settings.ambientSound)
            }
            audio.onAyahFinished = handleAyahFinished
        }
        .sheet(isPresented: $showSurahPicker) {
            SurahPickerView(surahs: store.surahs, selectedSurahIndex: $surahIndex)
                .onChange(of: surahIndex) { _, _ in
                    ayahIndex = 0
                    playCurrentAyah()
                }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(settings: settings, ambientPlayer: ambient)
        }
    }

    // MARK: - Background

    var background: some View {
        LinearGradient(
            colors: [
                Color(red: 0.05, green: 0.05, blue: 0.2),
                Color(red: 0.08, green: 0.03, blue: 0.25),
                Color(red: 0.12, green: 0.05, blue: 0.35),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(.white)
                .scaleEffect(1.5)
            Text("Loading Quran…")
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    // MARK: - Main Content

    var mainContent: some View {
        VStack(spacing: 0) {
            topBar
                .padding(.top, 60)
                .padding(.horizontal, 20)

            Spacer()

            if let surah = currentSurah, let ayah = currentAyah {
                ayahCard(surah: surah, ayah: ayah)
                    .padding(.horizontal, 20)
            }

            Spacer()

            progressBar
                .padding(.horizontal, 24)

            controlBar
                .padding(.horizontal, 20)
                .padding(.bottom, 48)
        }
    }

    // MARK: - Top Bar

    var topBar: some View {
        HStack {
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gear")
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(12)
                    .glassEffect()
            }

            Spacer()

            Button {
                showSurahPicker = true
            } label: {
                if let surah = currentSurah {
                    VStack(spacing: 2) {
                        Text(surah.nameLatin)
                            .font(.headline)
                            .foregroundStyle(.white)
                        Text(surah.meaning)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.65))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glassEffect()
                }
            }

            Spacer()

            Button {
                if let ayah = currentAyah {
                    settings.toggleBookmark(globalNumber: ayah.globalNumber)
                }
            } label: {
                Image(systemName: currentAyah.map { settings.bookmarkedAyahs.contains($0.globalNumber) } == true
                      ? "bookmark.fill" : "bookmark")
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(12)
                    .glassEffect()
            }
        }
    }

    // MARK: - Ayah Card

    func ayahCard(surah: Surah, ayah: Ayah) -> some View {
        VStack(spacing: 20) {
            Text(ayah.arabic)
                .font(.custom("UthmanicHafsV22", size: settings.arabicFontSize))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .environment(\.layoutDirection, .rightToLeft)

            if settings.showTranslation {
                Divider()
                    .overlay(.white.opacity(0.3))

                Text(ayah.translation)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.8))
                    .lineSpacing(4)
            }

            Text("\(surah.nameLatin) \(surah.number):\(ayah.number)")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.5))
        }
        .padding(28)
        .glassEffect(.regular.tint(.white.opacity(0.05)))
    }

    // MARK: - Progress Bar

    var progressBar: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(.white.opacity(0.2))
                        .frame(height: 3)

                    if audio.duration > 0 {
                        Capsule()
                            .fill(.white)
                            .frame(width: geo.size.width * (audio.progress / audio.duration), height: 3)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture { location in
                    audio.seek(to: location.x / geo.size.width)
                }
            }
            .frame(height: 12)

            if let surah = currentSurah {
                HStack {
                    Text(formatTime(audio.progress))
                    Spacer()
                    Text("Ayah \(ayahIndex + 1) of \(surah.ayahCount)")
                    Spacer()
                    Text(formatTime(audio.duration))
                }
                .font(.caption.monospacedDigit())
                .foregroundStyle(.white.opacity(0.5))
            }
        }
        .padding(.bottom, 20)
    }

    // MARK: - Control Bar

    var controlBar: some View {
        HStack(spacing: 0) {
            // Repeat
            Button { cycleRepeat() } label: {
                Image(systemName: repeatIcon)
                    .font(.title3)
                    .foregroundStyle(settings.repeatMode == .off ? .white.opacity(0.5) : .white)
                    .frame(maxWidth: .infinity)
            }

            // Previous
            Button { prevAyah() } label: {
                Image(systemName: "backward.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
            }

            // Play / Pause
            Button { audio.togglePlay() } label: {
                ZStack {
                    if audio.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: audio.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 72))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 80)
            }

            // Next
            Button { nextAyah() } label: {
                Image(systemName: "forward.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
            }

            // Sleep timer
            Button { cycleSleepTimer() } label: {
                VStack(spacing: 2) {
                    Image(systemName: "moon.zzz")
                        .font(.title3)
                        .foregroundStyle(sleepMinutes == nil ? .white.opacity(0.5) : .white)
                    if let mins = sleepMinutes {
                        Text("\(mins)m")
                            .font(.system(size: 9))
                            .foregroundStyle(.white)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 20)
        .padding(.horizontal, 8)
        .glassEffect()
    }

    // MARK: - Logic

    func playCurrentAyah() {
        guard let surah = currentSurah, let ayah = currentAyah else { return }
        guard let url = settings.selectedReciter.audioURL(for: ayah) else { return }
        audio.load(url: url)
        audio.updateNowPlaying(surah: surah, ayah: ayah)
    }

    func nextAyah() {
        guard let surah = currentSurah else { return }
        if ayahIndex < surah.ayahs.count - 1 {
            ayahIndex += 1
            playCurrentAyah()
        } else if settings.autoplayNext && surahIndex < store.surahs.count - 1 {
            surahIndex += 1
            ayahIndex = 0
            playCurrentAyah()
        }
    }

    func prevAyah() {
        if ayahIndex > 0 {
            ayahIndex -= 1
        } else if surahIndex > 0 {
            surahIndex -= 1
            ayahIndex = (currentSurah?.ayahs.count ?? 1) - 1
        }
        playCurrentAyah()
    }

    func handleAyahFinished() {
        switch settings.repeatMode {
        case .ayah:  playCurrentAyah()
        case .surah: nextAyah()
        case .off:   nextAyah()
        }
    }

    var repeatIcon: String {
        switch settings.repeatMode {
        case .off:   return "repeat"
        case .ayah:  return "repeat.1"
        case .surah: return "repeat"
        }
    }

    func cycleRepeat() {
        switch settings.repeatMode {
        case .off:   settings.repeatMode = .ayah
        case .ayah:  settings.repeatMode = .surah
        case .surah: settings.repeatMode = .off
        }
    }

    func cycleSleepTimer() {
        sleepTimer?.invalidate()
        let options: [Int?] = [nil, 10, 20, 30]
        let current = options.firstIndex(where: { $0 == sleepMinutes }) ?? 0
        sleepMinutes = options[(current + 1) % options.count]
        if let mins = sleepMinutes {
            sleepTimer = Timer.scheduledTimer(withTimeInterval: TimeInterval(mins * 60), repeats: false) { _ in
                audio.pause()
                sleepMinutes = nil
            }
        }
    }

    func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite else { return "0:00" }
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}
