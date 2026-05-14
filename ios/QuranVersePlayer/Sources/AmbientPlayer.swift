import AVFoundation

@Observable
class AmbientPlayer {
    var current: AmbientSound = .none
    var volume: Float = 0.4

    private var player: AVAudioPlayer?

    func play(_ sound: AmbientSound) {
        current = sound
        player?.stop()
        player = nil

        guard let filename = sound.filename,
              let url = Bundle.main.url(forResource: filename, withExtension: nil)
        else { return }

        player = try? AVAudioPlayer(contentsOf: url)
        player?.numberOfLoops = -1
        player?.volume = volume
        player?.play()
    }

    func setVolume(_ v: Float) {
        volume = v
        player?.volume = v
    }

    func stop() {
        player?.stop()
        player = nil
        current = .none
    }
}
