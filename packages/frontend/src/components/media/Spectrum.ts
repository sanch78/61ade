import {locale, t} from "../../I18n";

/** Optional audio spectrum; owns only its analysis graph and drawing resources. */
export function spectrum(audio: HTMLMediaElement, stage: HTMLElement, signal: AbortSignal): () => void {
    const root = document.createElement('div');
    root.className = 'blade-spectrum';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', t('Frekvenciaspektrum: mély hangoktól a magasakig'));
    const scale = document.createElement('div');
    scale.className = 'blade-spectrum__scale';
    for (const hz of [40, 800, 16000]) {
        const label = document.createElement('span');
        label.textContent = `${new Intl.NumberFormat(locale()).format(hz)} Hz`;
        scale.append(label);
    }
    const notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    root.append(canvas, scale, notice);
    stage.append(root);
    let context: AudioContext | undefined, source: MediaElementAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined, bins: Uint8Array<ArrayBuffer> | undefined, frame = 0;
    let unavailable = false;
    const brush = canvas.getContext('2d');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
        if (!brush) return;
        const width = canvas.clientWidth, height = canvas.clientHeight;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const pixelsWide = Math.max(1, Math.round(width * ratio));
        const pixelsHigh = Math.max(1, Math.round(height * ratio));
        if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
            canvas.width = pixelsWide;
            canvas.height = pixelsHigh;
        }
        brush.setTransform(ratio, 0, 0, ratio, 0, 0);
        brush.clearRect(0, 0, width, height);
        brush.fillStyle = getComputedStyle(root).color;
        const active = analyser && !audio.paused && !audio.ended;
        if (active) analyser!.getByteFrequencyData(bins!);
        const count = Math.max(1, Math.min(64, Math.floor(width / 7)));
        const max = Math.min(16000, (context?.sampleRate ?? 32000) / 2);
        for (let i = 0; i < count; i++) {
            let level = 0;
            if (active) {
                const step = context!.sampleRate / analyser!.fftSize;
                const from = Math.max(1, Math.floor(40 * (max / 40) ** (i / count) / step));
                const to = Math.min(bins!.length, Math.max(from + 1, Math.ceil(40 * (max / 40) ** ((i + 1) / count) / step)));
                for (let bin = from; bin < to; bin++) level = Math.max(level, bins![bin] / 255);
            }
            const bar = Math.max(2, level * (height - 4));
            brush.fillRect(i * width / count, height - bar, Math.max(1, width / count - 3), bar);
        }
    };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const animate = () => {
        stop();
        draw();
        if (!signal.aborted && !audio.paused && !audio.ended && !motion.matches && !document.hidden && analyser) {
            frame = requestAnimationFrame(animate);
        }
    };
    const unavailableNotice = () => {
        unavailable = true;
        if (!signal.aborted) notice.textContent = t('A frekvenciamegjelenítő nem érhető el ebben a böngészőben.');
    };
    // Initialize synchronously in the playback gesture, including native controls.
    const prepare = () => {
        if (signal.aborted || unavailable) return;
        try {
            if (!context) {
                if (!globalThis.AudioContext || !brush) { unavailableNotice(); return; }
                context = new AudioContext();
                analyser = context.createAnalyser();
                analyser.fftSize = 4096;
                analyser.smoothingTimeConstant = 0.8;
                bins = new Uint8Array(analyser.frequencyBinCount);
            }
            // Keep native audio audible while a browser waits for a Web Audio gesture.
            void context.resume().then(() => {
                if (signal.aborted) return;
                if (!source) {
                    source = context!.createMediaElementSource(audio);
                    source.connect(context!.destination);
                    source.connect(analyser!);
                }
                animate();
            }).catch(unavailableNotice);
        } catch { unavailableNotice(); }
    };
    audio.addEventListener('play', () => { prepare(); animate(); }, {signal});
    audio.addEventListener('pause', animate, {signal});
    audio.addEventListener('ended', animate, {signal});
    audio.addEventListener('pointerdown', prepare, {signal});
    audio.addEventListener('keydown', prepare, {signal});
    motion.addEventListener('change', animate, {signal});
    document.addEventListener('visibilitychange', animate, {signal});
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    signal.addEventListener('abort', () => {
        stop();
        resize.disconnect();
        source?.disconnect();
        analyser?.disconnect();
        if (context) void context.close().catch(() => {});
        root.remove();
    }, {once: true});
    return prepare;
}
