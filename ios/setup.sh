#!/bin/bash
set -e

echo "==> Setting up Quran Verse Player iOS project..."

# Install xcodegen if not present
if ! command -v xcodegen &> /dev/null; then
  echo "==> Installing xcodegen via Homebrew..."
  brew install xcodegen
fi

cd "$(dirname "$0")/QuranVersePlayer"

echo "==> Generating Xcode project..."
xcodegen generate

echo ""
echo "✅ Done! Now open the project in Xcode:"
echo ""
echo "   open ios/QuranVersePlayer/QuranVersePlayer.xcodeproj"
echo ""
echo "Then:"
echo "  1. Click the project in the left sidebar"
echo "  2. Under Signing & Capabilities → set your Team to your Apple ID"
echo "  3. Select your iPhone or Simulator from the toolbar"
echo "  4. Press ▶ Run"
