# YouTube Shorts Frame Stepper

Allows you to step backward or forward through YouTube Shorts one video frame at a time using the keyboard, just like standard YouTube Videos.

- Press **`,`** to step backward one frame.
- Press **`.`** to step forward one frame.

YouTube does not provide the frame rate for videos, so the correct frame rate is extrapolated by timing the number of frames that occur in the first few moments of a video. If the measurement is unavailable or inconclusive, it falls back to 30 fps.

## Features

- Frame-by-frame stepping for YouTube Shorts
- Automatic frame-rate detection
- Support for common fractional frame rates such as 23.976, 29.97, and 59.94 fps
- Safe 30 fps fallback
- Works with YouTube's single-page navigation
- Does not interfere with comma and period shortcuts on standard YouTube video pages
- Ignores shortcuts while typing in form fields or editable content
- No analytics, advertising, tracking, or remotely loaded code

## Usage

1. Open a Short at [YouTube.com/shorts](https://www.YouTube.com/shorts/).
2. Allow the Short to begin playing so the extension can measure its frame rate.
3. Press **`,`** to move backward one frame.
4. Press **`.`** to move forward one frame.

The video pauses automatically when one of the frame stepping keys is pressed.

## Browser Support

The extension is intended for desktop browsers.

- Firefox 142 or newer
- Chromium-based browsers compatible with Manifest V3

Mobile browsers are not currently supported because we require a physical keyboard to jump from frame to frame.

## Installation

### Firefox

Install the published extension from Mozilla Add-ons once available.

For temporary local testing:

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose the repository's `manifest.json` file.

The temporary installation will be removed when Firefox closes or if you manually unload it.

### Chromium

For local testing in Chrome, Chromium, Brave, Edge, or another Chromium-based browser:

1. Open the browser's extensions page, such as `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the repository folder containing `manifest.json`.

## How It Works

The extension is loaded throughout `YouTube.com` so it remains available when YouTube navigates into Shorts without performing a full page load, as is common with a single-page application (SPA). Keyboard events are intercepted only while the current page is a Shorts page.

YouTube Shorts can use different frame rates, and YouTube doesn't provide a way to step from frame to frame. But it does allow precise tracking (e.g., step to timestamp 2:34.0203).

So in order to determine the playback position of the next or previous frame, we need to estimate the Short's frame rate. When the video begins playing, the addon uses `requestVideoFrameCallback()` to compare the number of presented frames with the amount of video time (`mediaTime`) that has elapsed during a short sampling period, giving us an estimated frame rate. That estimate is then matched to the nearest common frame rate (if it falls within a reasonable tolerance).

Frame stepping via the `.` or `,` keys then changes the video's current playback position by the duration of one frame interval. Here are the frame rates the script looks for:

### Standard Frame Rates:

|     Frame rate | Typical uses                                   |
| -------------: | ---------------------------------------------- |
|     **12 fps** | Animation, stop-motion, stylized motion        |
|     **15 fps** | Low-bandwidth video, webcams, security footage |
| **23.976 fps** | Film-based TV and streaming in NTSC regions    |
|     **24 fps** | Cinema and cinematic video                     |
|     **25 fps** | PAL-region television and video                |
|  **29.97 fps** | NTSC broadcast and legacy video                |
|     **30 fps** | General web, phone, and screen video           |
|     **48 fps** | High-frame-rate cinema                         |
|     **50 fps** | Sports and live video in PAL regions           |
|  **59.94 fps** | NTSC sports, broadcast, and game capture       |
|     **60 fps** | Smooth web video, gaming, sports               |
|    **100 fps** | PAL-based HFR and slow motion                  |
| **119.88 fps** | NTSC-based HFR and slow motion                 |
|    **120 fps** | HFR gaming, sports, and slow motion            |

### Fractional Frame Rates:

|     Frame rate | Derived From     | Typical uses                   |
| -------------: | ---------------- | ------------------------------ |
|     **23.976** | ≈ 24000 / 1001   | fractional counterpart to 24   |
|      **29.97** | ≈ 30000 / 1001   | fractional counterpart to 30   |
|      **59.94** | ≈ 60000 / 1001   | fractional counterpart to 60   |
|     **119.88** | ≈ 120000 / 1001  | fractional counterpart to 120  |

These fractional rates come from NTSC color-television timing. Modern equipment retains them because enormous amounts of broadcast and production infrastructure use that timing.

## Privacy

The extension is privacy-centric:

- It collects no personal information
- It stores no browsing history or settings
- It sends no data to the developer or third parties
- It contains no analytics or advertising
- It makes no external network requests
- It loads no remote code

All processing occurs locally in the browser.

## Troubleshooting

### The first step is not perfectly accurate

extension needs a small number of presented frames to measure the frame rate. Usually, that happens so fast that you won't even notice it, but if you have trouble, just let the Short play briefly before stepping.

### The extension uses 30 fps

The Short may have been paused before enough samples were collected, or your browser may not support the required video-frame callback API. Resume playback briefly and try again.

### The shortcuts do not work

Confirm that:

- The current URL is a YouTube Shorts page
- Neither **Ctrl**, **Alt**, **Shift**, nor **Command/Meta** is held
- Focus is not inside a text field, comment box, or other editable element

### Standard YouTube videos

The extension deliberately leaves comma and period shortcuts untouched outside `/shorts/`, allowing YouTube's normal frame-stepping behavior to continue working on standard video pages.

## Website

Project documentation:

<https://pbarney.github.io/YouTube-shorts-frame-stepper/>

## Development

The extension requires only:

```text
manifest.json
content.js
```

The GitHub Pages website is stored in:

```text
docs/
```

To test changes, reload the extension from the browser's extension-development page and then refresh the YouTube tab.

## Contributing

Bug reports and focused compatibility reports are welcome through GitHub Issues. When reporting a problem, include:

- Browser name and version number
- Frame Stepper extension version number
- Operating system
- Whether the problem occurs on all Shorts or only a particular Short
- Any relevant console warnings
