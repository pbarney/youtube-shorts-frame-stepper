(() => {
    'use strict';

    const GLOBAL_NAME = "__youtubeShortsFrameStepper";

    // Remove any previously installed version.
    window[GLOBAL_NAME]?.remove?.();

    const DebugLevel = Object.freeze({
        NONE: 0,
        BASIC: 1,
        EXTENDED: 2,
    });

    let debugLevel = DebugLevel.NONE;

    const CONFIG = {
        fallbackFPS: 30,
        targetSamples: 10,
        minimumSamples: 4,
        maximumMeasurementTime: 1200,
        snapTolerance: 0.02
    };

    const STANDARD_FRAME_RATES = [
        12,
        15,
        20,
        23.976,
        24,
        25,
        29.97,
        30,
        48,
        50,
        59.94,
        60,
        100,
        119.88,
        120
    ];

    function debugLog(...args) {
        if (debugLevel === DebugLevel.NONE || args.length === 0) {
            return;
        }

        if (debugLevel === DebugLevel.BASIC) {
            console.log(args[0]);
            return;
        }

        console.log(...args);
    }

    /*
     * When the active Short changes, this state is reset and the
     * previous Short's measurement is discarded.
     */
    const activeShort = {
        key: null,
        video: null,
        fps: CONFIG.fallbackFPS,
        rawFPS: null,
        source: "fallback",
        status: "no-video",
        sampleCount: 0
    };

    let runningMeasurement = null;
    let scheduledCheckId = null;
    let removed = false;

    function getLargestVisibleVideo() {
        return [...document.querySelectorAll("video")]
            .map(video => {
                const rect = video.getBoundingClientRect();

                const visibleWidth = Math.max(
                    0,
                    Math.min(rect.right, window.innerWidth) -
                    Math.max(rect.left, 0)
                );

                const visibleHeight = Math.max(
                    0,
                    Math.min(rect.bottom, window.innerHeight) -
                    Math.max(rect.top, 0)
                );

                return {
                    video,
                    visibleArea: visibleWidth * visibleHeight
                };
            })
            .filter(candidate =>
                candidate.visibleArea > 0 &&
                candidate.video.readyState >= HTMLMediaElement.HAVE_METADATA
            )
            .sort(
                (left, right) => right.visibleArea - left.visibleArea
            )[0]?.video ?? null;
    }

    function extractShortId(urlValue) {
        if (!urlValue) {
            return null;
        }

        try {
            const url = new URL(
                urlValue,
                window.location.href
            );

            const match = url.pathname.match(
                /^\/shorts\/([^/?#]+)/
            );

            return match?.[1] ?? null;
        } catch {
            return null;
        }
    }

    function getShortKey(video) {
        /*
         * Prefer a link inside the renderer containing the active video.
         * This is more reliable while scrolling than relying exclusively on 
         * the browser URL.
         */
        const renderer = video.closest(
            "ytd-reel-video-renderer"
        );

        const shortLink = renderer?.querySelector(
            'a[href^="/shorts/"], ' +
            'a[href*="youtube.com/shorts/"]'
        );

        const rendererShortId = extractShortId(
            shortLink?.href
        );

        if (rendererShortId) {
            return `short:${rendererShortId}`;
        }

        /*
         * YouTube normally changes the page URL as each Short becomes
         * active, so this is the primary fallback.
         */
        const pageShortId = extractShortId(
            window.location.href
        );

        if (pageShortId) {
            return `short:${pageShortId}`;
        }

        /*
         * Last-resort fallback. This may be less reliable when YouTube uses
         * Media Source Extensions, but is still preferable to treating every
         * Short as one item.
         */
        const mediaSource =
            video.currentSrc ||
            video.src;

        if (mediaSource) {
            return `source:${mediaSource}`;
        }

        return null;
    }

    function resetActiveShort(key, video) {
        activeShort.key = key;
        activeShort.video = video;
        activeShort.fps = CONFIG.fallbackFPS;
        activeShort.rawFPS = null;
        activeShort.source = "fallback";
        activeShort.status = "unmeasured";
        activeShort.sampleCount = 0;
    }

    function resetMeasurementState(status = "unmeasured") {
        activeShort.fps = CONFIG.fallbackFPS;
        activeShort.rawFPS = null;
        activeShort.source = "fallback";
        activeShort.status = status;
        activeShort.sampleCount = 0;
    }

    function isEditableElement(element) {
        if (!(element instanceof Element)) {
            return false;
        }

        return Boolean(
            element.closest(
                "input, textarea, select"
            )
        ) || (
            element instanceof HTMLElement &&
            element.isContentEditable
        );
    }

    function median(values) {
        const sorted = [...values].sort(
            (left, right) => left - right
        );

        const middle = Math.floor(
            sorted.length / 2
        );

        return sorted.length % 2
            ? sorted[middle]
            : (
                sorted[middle - 1] +
                sorted[middle]
            ) / 2;
    }

    function snapToStandardFrameRate(rawFPS) {
        const closestRate =
            STANDARD_FRAME_RATES.reduce(
                (closest, candidate) =>
                    Math.abs(candidate - rawFPS) <
                    Math.abs(closest - rawFPS)
                        ? candidate
                        : closest
            );

        const relativeDifference =
            Math.abs(closestRate - rawFPS) / rawFPS;

        return relativeDifference <= CONFIG.snapTolerance
            ? closestRate
            : rawFPS;
    }

    function clearMeasurementHandles(measurement) {
        if (
            measurement.callbackId !== null &&
            typeof measurement.video.cancelVideoFrameCallback === "function"
        ) {
            measurement.video.cancelVideoFrameCallback(
                measurement.callbackId
            );
        }

        if (measurement.timerId !== null) {
            clearTimeout(measurement.timerId);
        }

        measurement.callbackId = null;
        measurement.timerId = null;
    }

    function abortRunningMeasurement(
        reason,
        replacementStatus = "unmeasured"
    ) {
        const measurement = runningMeasurement;

        if (!measurement) {
            return;
        }

        clearMeasurementHandles(measurement);
        runningMeasurement = null;

        /*
         * Reset the displayed state only if this measurement still
         * belongs to the active Short.
         */
        if (
            activeShort.key === measurement.key &&
            activeShort.video === measurement.video &&
            activeShort.status === "measuring"
        ) {
            resetMeasurementState(
                replacementStatus
            );
        }

        if (reason) {
            debugLog(
                `Frame-rate measurement stopped: ${reason}.`
            );
        }
    }

    function measureFrameRate(video, key) {
        if (
            key !== activeShort.key ||
            video !== activeShort.video
        ) {
            return;
        }

        if (
            activeShort.status === "measured" ||
            activeShort.status === "measuring" ||
            activeShort.status === "unsupported"
        ) {
            return;
        }

        if (
            typeof video.requestVideoFrameCallback !==
            "function"
        ) {
            activeShort.status = "unsupported";

            console.warn(
                "requestVideoFrameCallback() is unavailable; " +
                `using ${CONFIG.fallbackFPS} fps.`
            );

            return;
        }

        /*
         * Measurement begins only after playback has begun.
         */
        if (
            video.paused ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
            activeShort.status = "waiting";
            return;
        }

        if (runningMeasurement) {
            abortRunningMeasurement(
                "a new measurement began"
            );
        }

        const intervals = [];

        let previousFrame = null;

        const measurement = {
            key,
            video,
            intervals,
            callbackId: null,
            timerId: null
        };

        runningMeasurement = measurement;

        activeShort.fps = CONFIG.fallbackFPS;
        activeShort.rawFPS = null;
        activeShort.source = "fallback";
        activeShort.status = "measuring";
        activeShort.sampleCount = 0;

        function finishMeasurement(reason) {
            if (runningMeasurement !== measurement) {
                return;
            }

            clearMeasurementHandles(measurement);
            runningMeasurement = null;

            /*
             * Ignore results if the user has moved to another Short.
             */
            if (
                activeShort.key !== key ||
                activeShort.video !== video
            ) {
                return;
            }

            if (
                intervals.length <
                CONFIG.minimumSamples
            ) {
                activeShort.fps = CONFIG.fallbackFPS;
                activeShort.rawFPS = null;
                activeShort.source = "fallback";
                activeShort.sampleCount = intervals.length;

                /*
                 * If playback stopped too soon, allow another attempt
                 * the next time this Short begins playing.
                 */
                activeShort.status = video.paused
                    ? "waiting"
                    : "fallback";

                console.warn(
                    `Frame-rate measurement ended because ${reason}, ` +
                    `but only ${intervals.length} usable samples were ` +
                    `collected. Using ${CONFIG.fallbackFPS} fps.`
                );

                return;
            }

            const medianInterval = median(intervals);
            const rawFPS = 1 / medianInterval;
            const detectedFPS = snapToStandardFrameRate(rawFPS);

            activeShort.fps = detectedFPS;
            activeShort.rawFPS = rawFPS;
            activeShort.source = "measured";
            activeShort.status = "measured";
            activeShort.sampleCount = intervals.length;

            debugLog(
                `Frame rate detected for ${key}: ` +
                `${detectedFPS} fps`,
                {
                    rawFPS,
                    samples: intervals.length,
                    video
                }
            );
        }

        function handleFrame(now, metadata) {
            if (
                removed ||
                runningMeasurement !== measurement
            ) {
                return;
            }

            /*
             * Detect YouTube reassigning the same <video> element to a
             * different Short while measurement is still running.
             */
            const currentKey = getShortKey(video);

            if (
                currentKey &&
                currentKey !== key
            ) {
                abortRunningMeasurement(
                    "the video element changed content"
                );

                scheduleActiveShortCheck();
                return;
            }

            if (
                activeShort.key !== key ||
                activeShort.video !== video
            ) {
                abortRunningMeasurement(
                    "a different Short became active"
                );

                return;
            }

            /*
             * calculate the actual FPS based on the number of frames counted 
             * during the total "mediaTime" that has passed
             */
            if (previousFrame !== null) {
                const frameDifference =
                    metadata.presentedFrames -
                    previousFrame.presentedFrames;

                const timeDifference =
                    metadata.mediaTime -
                    previousFrame.mediaTime;

                if (
                    frameDifference > 0 &&
                    timeDifference > 0
                ) {
                    const secondsPerFrame =
                        timeDifference /
                        frameDifference;

                    /*
                     * Reject frame rates outside a  plausible range of 
                     * 5 through 240 fps.
                     */
                    if (
                        secondsPerFrame >= 1 / 240 &&
                        secondsPerFrame <= 1 / 5
                    ) {
                        intervals.push(secondsPerFrame);
                        activeShort.sampleCount = intervals.length;
                    }
                }
            }

            previousFrame = {
                mediaTime: metadata.mediaTime,
                presentedFrames: metadata.presentedFrames
            };

            if (
                intervals.length >=
                CONFIG.targetSamples
            ) {
                finishMeasurement(
                    "enough samples were collected"
                );

                return;
            }

            measurement.callbackId =
                video.requestVideoFrameCallback(
                    handleFrame
                );
        }

        measurement.callbackId =
            video.requestVideoFrameCallback(handleFrame);

        measurement.timerId = setTimeout(
            () => finishMeasurement(
                "the measurement time limit was reached"
            ),
            CONFIG.maximumMeasurementTime
        );

        debugLog(
            `Measuring frame rate for ${key}...`,
            video
        );
    }

    /*
     * script should only function in a Shorts page, but we can end up there
     * without a full page load due to Youtube's SPA behavior. So we'll need
     * to run this script on all of youtube.com, but filter out any pages that
     * aren't under the /shorts url.
     */
    function isShortsPage() {
        return window.location.pathname.startsWith("/shorts/");
    }

    function checkActiveShort() {
        if (!isShortsPage()) {
            abortRunningMeasurement(
                "the user left YouTube Shorts"
            );

            activeShort.key = null;
            activeShort.video = null;
            activeShort.status = "no-video";

            return null;
        }

        const video = getLargestVisibleVideo();

        if (!video) {
            return null;
        }

        const key = getShortKey(video);

        if (!key) {
            console.warn(
                "The active Short's identity could not be determined."
            );

            return null;
        }

        const shortChanged =
            key !== activeShort.key;

        const videoElementChanged =
            video !== activeShort.video;

        if (shortChanged) {
            abortRunningMeasurement(
                "a different Short became active"
            );

            resetActiveShort(key, video);

            debugLog(
                "Active Short changed.",
                {
                    key,
                    video,
                    fps: activeShort.fps,
                    source: activeShort.source,
                    status: activeShort.status,
                    paused: video.paused
                }
            );
        } else if (videoElementChanged) {
            /*
             * The Short identity is unchanged, but YouTube replaced its
             * media element. Keep a completed measurement, but restart
             * an incomplete one against the new element.
             */
            abortRunningMeasurement(
                "the active video element changed"
            );

            activeShort.video = video;

            if (
                activeShort.status !== "measured"
            ) {
                resetMeasurementState();
            }
        }

        /*
         * This runs even when the active Short hasn't changed. That way, any
         * Short is in a paused state when first discovered will be measured
         * later after the user manually starts playback.
         */
        if (
            !video.paused &&
            (
                activeShort.status === "unmeasured" ||
                activeShort.status === "waiting" ||
                activeShort.status === "fallback"
            )
        ) {
            measureFrameRate(video, key);
        }

        return {
            key,
            video
        };
    }

    function scheduleActiveShortCheck() {
        if (
            removed ||
            scheduledCheckId !== null
        ) {
            return;
        }

        scheduledCheckId =
            requestAnimationFrame(() => {
                scheduledCheckId = null;
                checkActiveShort();
            });
    }

    function stepActiveVideo(direction) {
        /*
         * Deliberately locate the video again on every keypress.
         * The keyboard handler is not tied to any one video.
         */
        const current = checkActiveShort();

        if (!current) {
            console.warn(
                "No active YouTube Short was found."
            );

            return;
        }

        const video = current.video;

        const fps =
            activeShort.source === "measured"
                ? activeShort.fps
                : CONFIG.fallbackFPS;

        const secondsPerFrame = 1 / fps;

        const maximumTime =
            Number.isFinite(video.duration)
                ? video.duration
                : Infinity;

        video.pause();

        video.currentTime = Math.min(
            maximumTime,
            Math.max(
                0,
                video.currentTime + direction * secondsPerFrame
            )
        );
    }

    function handleKeydown(event) {
        /*
         * The content script is loaded throughout YouTube so it will
         * already be available after SPA navigation into Shorts.
         * Outside Shorts, leave all keyboard events untouched.
         */
        if (!isShortsPage()) {
            return;
        }

        if (
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.shiftKey ||
            isEditableElement(event.target)
        ) {
            return;
        }

        let direction;

        if (
            event.code === "Comma" ||
            event.key === ","
        ) {
            direction = -1;
        } else if (
            event.code === "Period" ||
            event.key === "."
        ) {
            direction = 1;
        } else {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        stepActiveVideo(direction);
    }

    function handlePlaybackEvent(event) {
        if (!(event.target instanceof HTMLVideoElement)) {
            return;
        }

        /*
         * Wait until layout and playback state have settled, then find
         * the largest visible video
         */
        scheduleActiveShortCheck();
    }

    window.addEventListener(
        "keydown",
        handleKeydown,
        true
    );

    /*
     * Scrolling changes which existing video is largest and visible.
     */
    window.addEventListener(
        "scroll",
        scheduleActiveShortCheck,
        true
    );

    /*
     * YouTube normally starts the newly active Short automatically.
     * Captured media events let us begin measuring before the user
     * presses a stepping key.
     */
    document.addEventListener(
        "play",
        handlePlaybackEvent,
        true
    );

    document.addEventListener(
        "playing",
        handlePlaybackEvent,
        true
    );

    /*
     * Internal diagnostic and lifecycle controller.
     * May later be exposed through extension messaging.
     */
    const controller = {
        status() {
            const current = checkActiveShort();

            if (!current) {
                return {
                    key: null,
                    video: null,
                    fps: CONFIG.fallbackFPS,
                    source: "fallback",
                    status: "no-video"
                };
            }

            return {
                key: activeShort.key,
                video: activeShort.video,
                fps: activeShort.fps,
                rawFPS: activeShort.rawFPS,
                source: activeShort.source,
                status: activeShort.status,
                sampleCount: activeShort.sampleCount,
                paused: activeShort.video.paused,
                currentTime: activeShort.video.currentTime
            };
        },

        remeasure() {
            const current = checkActiveShort();

            if (!current) {
                console.warn(
                    "No active Short was found."
                );

                return;
            }

            abortRunningMeasurement(
                "manual remeasurement requested"
            );

            resetMeasurementState();

            if (activeShort.video.paused) {
                activeShort.status = "waiting";

                debugLog(
                    "The active Short will be measured when playback begins."
                );

                return;
            }

            measureFrameRate(
                activeShort.video,
                activeShort.key
            );
        },

        remove() {
            if (removed) {
                return;
            }

            removed = true;

            abortRunningMeasurement();

            window.removeEventListener(
                "keydown",
                handleKeydown,
                true
            );

            window.removeEventListener(
                "scroll",
                scheduleActiveShortCheck,
                true
            );

            document.removeEventListener(
                "play",
                handlePlaybackEvent,
                true
            );

            document.removeEventListener(
                "playing",
                handlePlaybackEvent,
                true
            );

            if (scheduledCheckId !== null) {
                cancelAnimationFrame(
                    scheduledCheckId
                );

                scheduledCheckId = null;
            }

            delete window[GLOBAL_NAME];

            debugLog(
                "YouTube Shorts frame stepper removed."
            );
        }
    };

    window[GLOBAL_NAME] = controller;

    /*
     * Handle the Short that was already playing when the script
     * was pasted into the console.
     */
    checkActiveShort();

    console.log(
        "YouTube Shorts frame stepper installed.",
        "Use , and . to step backward and forward."
    );
})();