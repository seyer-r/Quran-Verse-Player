import AVFoundation
import MediaPlayer

@Observable
class AudioPlayer: NSObject {
    var isPlaying = false
    var isLoading = false
    var progress: Double = 0
    var duration: Double = 0

    private var player: AVPlayer?
    private var timeObserver: Any?
    var onAyahFinished: (() -> Void)?

    override init() {
        super.init()
        configureSession()
        setupRemoteControls()
    }

    private func configureSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    func load(url: URL) {
        stop()
        isLoading = true
        progress = 0
        duration = 0

        let item = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: item)

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(didFinishPlaying),
            name: .AVPlayerItemDidPlayToEndTime,
            object: item
        )

        timeObserver = player?.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            self.progress = time.seconds
            if let dur = self.player?.currentItem?.duration.seconds, dur.isFinite {
                self.duration = dur
            }
        }

        Task {
            await item.asset.load(.isPlayable)
            await MainActor.run {
                self.isLoading = false
                self.player?.play()
                self.isPlaying = true
            }
        }
    }

    func play() {
        player?.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func togglePlay() {
        isPlaying ? pause() : play()
    }

    func stop() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
        }
        player?.pause()
        player = nil
        isPlaying = false
        isLoading = false
    }

    func seek(to fraction: Double) {
        guard duration > 0 else { return }
        let target = CMTime(seconds: fraction * duration, preferredTimescale: 600)
        player?.seek(to: target)
    }

    @objc private func didFinishPlaying() {
        isPlaying = false
        onAyahFinished?()
    }

    private func setupRemoteControls() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            self?.play(); return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.pause(); return .success
        }
        center.nextTrackCommand.addTarget { _ in .success }
        center.previousTrackCommand.addTarget { _ in .success }
    }

    func updateNowPlaying(surah: Surah, ayah: Ayah) {
        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = "\(surah.nameLatin) — Ayah \(ayah.number)"
        info[MPMediaItemPropertyArtist] = surah.nameArabic
        info[MPMediaItemPropertyAlbumTitle] = "Quran"
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = progress
        info[MPMediaItemPropertyPlaybackDuration] = duration
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
