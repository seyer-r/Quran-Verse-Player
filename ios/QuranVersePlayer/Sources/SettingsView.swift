import SwiftUI

struct SettingsView: View {
    @Bindable var settings: SettingsStore
    var ambientPlayer: AmbientPlayer
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(colors: [.indigo.opacity(0.95), .purple.opacity(0.85)],
                               startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()

                List {
                    // Reciter
                    Section("Reciter") {
                        ForEach(allReciters) { reciter in
                            Button {
                                settings.reciterId = reciter.id
                            } label: {
                                HStack {
                                    Text(reciter.name).foregroundStyle(.white)
                                    Spacer()
                                    if settings.reciterId == reciter.id {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.white)
                                    }
                                }
                            }
                            .listRowBackground(Color.white.opacity(0.07))
                        }
                    }

                    // Playback
                    Section("Playback") {
                        Toggle("Autoplay next surah", isOn: $settings.autoplayNext)
                            .tint(.purple)
                            .listRowBackground(Color.white.opacity(0.07))
                            .foregroundStyle(.white)

                        Picker("Repeat", selection: $settings.repeatMode) {
                            Text("Off").tag(RepeatMode.off)
                            Text("Ayah").tag(RepeatMode.ayah)
                            Text("Surah").tag(RepeatMode.surah)
                        }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.white.opacity(0.07))
                    }

                    // Display
                    Section("Display") {
                        Toggle("Show translation", isOn: $settings.showTranslation)
                            .tint(.purple)
                            .listRowBackground(Color.white.opacity(0.07))
                            .foregroundStyle(.white)

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Arabic font size: \(Int(settings.arabicFontSize))pt")
                                .foregroundStyle(.white)
                            Slider(value: $settings.arabicFontSize, in: 20...52, step: 2)
                                .tint(.white)
                        }
                        .listRowBackground(Color.white.opacity(0.07))
                    }

                    // Ambient
                    Section("Ambient Sound") {
                        ForEach(AmbientSound.allCases) { sound in
                            Button {
                                settings.ambientSound = sound
                                ambientPlayer.play(sound)
                            } label: {
                                HStack {
                                    Text(sound.label).foregroundStyle(.white)
                                    Spacer()
                                    if settings.ambientSound == sound {
                                        Image(systemName: "checkmark").foregroundStyle(.white)
                                    }
                                }
                            }
                            .listRowBackground(Color.white.opacity(0.07))
                        }

                        if settings.ambientSound != .none {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Volume: \(Int(settings.ambientVolume * 100))%")
                                    .foregroundStyle(.white)
                                Slider(value: Binding(
                                    get: { Double(settings.ambientVolume) },
                                    set: {
                                        settings.ambientVolume = Float($0)
                                        ambientPlayer.setVolume(Float($0))
                                    }
                                ), in: 0...1)
                                .tint(.white)
                            }
                            .listRowBackground(Color.white.opacity(0.07))
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(.white)
                }
            }
        }
    }
}
