(() => {
    const MINUTES = Array.from({ length: 7 }, (_, minute) => minute); // 0〜6分

    const MINUTE_WINDOWS = {
        1: { start: 50, end: 60 },
        2: { start: 110, end: 120 },
        3: { start: 170, end: 180 },
        4: { start: 230, end: 240 },
        5: { start: 290, end: 300 },
        6: { start: 350, end: 360 }
    };

    const METRIC_ORDER = ["spo2", "pulse", "distance", "borg"];

    const METRICS = {
        spo2: {
            key: "spo2",
            label: "SpO₂",
            unit: "%",
            min: 70,
            max: 100,
            decimals: 0,
            allowDecimal: false,
            step: 1,
            requiresBaseline: true,
            toastLabel: "SpO₂"
        },
        pulse: {
            key: "pulse",
            label: "脈拍",
            unit: "bpm",
            min: 50,
            max: 200,
            decimals: 0,
            allowDecimal: false,
            step: 1,
            requiresBaseline: true,
            toastLabel: "脈拍"
        },
        distance: {
            key: "distance",
            label: "歩行距離",
            unit: "m",
            min: 0,
            max: 2000,
            decimals: 1,
            allowDecimal: true,
            step: 0.5,
            requiresBaseline: true,
            toastLabel: "歩行距離"
        },
        borg: {
            key: "borg",
            label: "Borg",
            unit: "",
            min: 0,
            max: 10,
            decimals: 0,
            allowDecimal: false,
            step: 1,
            requiresBaseline: true,
            toastLabel: "Borg"
        }
    };

    const REQUIRED_MINUTE_METRICS = {
        0: ["spo2", "pulse", "borg", "distance"],
        1: ["spo2", "pulse", "borg"],
        2: ["spo2", "pulse", "borg"],
        3: ["spo2", "pulse", "borg"],
        4: ["spo2", "pulse", "borg"],
        5: ["spo2", "pulse", "borg"],
        6: ["spo2", "pulse", "borg", "distance"]
    };

    const state = {
        data: Object.fromEntries(Object.keys(METRICS).map((key) => [key, MINUTES.map(() => null)])),
        currentValues: Object.fromEntries(Object.keys(METRICS).map((key) => [key, null])),
        timer: {
            running: false,
            started: false,
            completed: false,
            startTimestamp: null,
            elapsedMs: 0,
            intervalId: null,
            lastPromptMinute: 0
        },
        minuteRecorded: new Set(),
        recoveryTime: {
            minutes: null,
            seconds: null
        },
        recoveryTimer: {
            running: false,
            startTimestamp: null,
            elapsedMs: 0,
            intervalId: null
        }
    };

    const panelButtons = document.querySelectorAll(".panel");
    const mainApp = document.querySelector(".app");
    const measurementView = document.getElementById("measurementView");
    const completionView = document.getElementById("completionView");
    const baselineSpo2ValueEl = document.getElementById("baselineSpo2Value");
    const recoveryMinutesInput = document.getElementById("recoveryMinutes");
    const recoverySecondsInput = document.getElementById("recoverySeconds");
    const saveRecoveryBtn = document.getElementById("saveRecoveryBtn");
    const startRecoveryBtn = document.getElementById("startRecoveryBtn");
    const stopRecoveryBtn = document.getElementById("stopRecoveryBtn");
    const recoveryCountdownSection = document.getElementById("recoveryCountdownSection");
    const recoveryStartSection = document.getElementById("recoveryStartSection");
    const recoveryTimerDisplay = document.getElementById("recoveryTimerDisplay");
    const timerDisplayEl = document.getElementById("timerDisplay");
    const inputCueEl = document.getElementById("inputCue");
    const startStopBtn = document.getElementById("startStopBtn");
    const resetBtn = document.getElementById("resetBtn");
    const commitBtn = document.getElementById("commitBtn");
    const minutePromptsEl = document.getElementById("minutePrompts");
    const toastContainer = document.getElementById("toastContainer");
    const showRecordsBtn = document.getElementById("showRecordsBtn");

    const modal = document.getElementById("inputModal");
    const modalTitle = document.getElementById("modalTitle");
    const metricInput = document.getElementById("metricInput");
    const modalNote = document.getElementById("modalNote");
    const cancelInputBtn = document.getElementById("cancelInputBtn");
    const saveEntryBtn = document.getElementById("saveEntryBtn");
    
    // SpO2スクロールピッカー関連
    const spo2PickerContainer = document.getElementById("spo2PickerContainer");
    const spo2PickerScroll = document.getElementById("spo2PickerScroll");
    const spo2DisplayValue = document.getElementById("spo2DisplayValue");
    
    // Borgスクロールピッカー関連
    const borgPickerContainer = document.getElementById("borgPickerContainer");
    const borgPickerScroll = document.getElementById("borgPickerScroll");
    const borgDisplayValue = document.getElementById("borgDisplayValue");

    const recordModal = document.getElementById("recordModal");
    const recordTableBody = document.getElementById("recordTableBody");
    const recoverySummary = document.getElementById("recoverySummary");

    const resetDialog = document.getElementById("resetDialog");
    const cancelResetBtn = document.getElementById("cancelResetBtn");
    const confirmResetBtn = document.getElementById("confirmResetBtn");

    const usageWarningDialog = document.getElementById("usageWarningDialog");
    const cancelUsageBtn = document.getElementById("cancelUsageBtn");
    const confirmUsageBtn = document.getElementById("confirmUsageBtn");
    const showUsageBtn = document.getElementById("showUsageBtn");

    const minuteBadges = new Map();

    let activeMetricKey = null;

    function init() {
        initMinuteBadges();
        attachEventListeners();
        showRecordsBtn.disabled = true;
        updatePanels();
        updateMinuteBadges();
        updateTimerDisplay();
        updateControlStates();
        updateCompletionView();
        updateRecoverySummary();
        updateInputCue();
    }

    function attachEventListeners() {
        panelButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const metricKey = button.dataset.metric;
                openModal(metricKey);
            });
        });

        startStopBtn.addEventListener("click", handleStartStopClick);
        resetBtn.addEventListener("click", openResetDialog);
        commitBtn.addEventListener("click", handleCommit);
        showUsageBtn.addEventListener("click", handleUsageClick);
        saveRecoveryBtn.addEventListener("click", saveRecoveryTime);
        showRecordsBtn.addEventListener("click", openRecordModal);
        
        // 回復時間カウントダウン
        if (startRecoveryBtn) {
            startRecoveryBtn.addEventListener("click", startRecoveryTimer);
        }
        if (stopRecoveryBtn) {
            stopRecoveryBtn.addEventListener("click", stopRecoveryTimer);
        }

        cancelInputBtn.addEventListener("click", closeModal);
        saveEntryBtn.addEventListener("click", saveCurrentEntry);

        modal.addEventListener("click", (event) => {
            if (event.target.matches("[data-dismiss=modal]")) {
                closeModal();
            }
        });

        recordModal.addEventListener("click", (event) => {
            if (event.target.matches("[data-dismiss=record-modal]")) {
                closeRecordModal();
            }
        });

        resetDialog.addEventListener("click", (event) => {
            if (event.target.matches("[data-dismiss=dialog]")) {
                closeResetDialog();
            }
        });

        cancelResetBtn.addEventListener("click", closeResetDialog);
        confirmResetBtn.addEventListener("click", () => performReset(true));

        usageWarningDialog.addEventListener("click", (event) => {
            if (event.target.matches("[data-dismiss=usage-warning-dialog]")) {
                closeUsageWarningDialog();
            }
        });

        cancelUsageBtn.addEventListener("click", closeUsageWarningDialog);
        confirmUsageBtn.addEventListener("click", () => {
            closeUsageWarningDialog();
            window.location.href = "usage.html";
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                if (!modal.classList.contains("hidden")) {
                    closeModal();
                } else if (!recordModal.classList.contains("hidden")) {
                    closeRecordModal();
                } else if (!resetDialog.classList.contains("hidden")) {
                    closeResetDialog();
                } else if (!usageWarningDialog.classList.contains("hidden")) {
                    closeUsageWarningDialog();
                }
            }
        });
    }

    function initMinuteBadges() {
        minutePromptsEl.innerHTML = "";
        MINUTES.forEach((minute) => {
            const badge = document.createElement("span");
            badge.className = "minute-badge";
            badge.dataset.minute = String(minute);
            badge.textContent = minute === 0 ? "開始" : `${minute}分`;
            minutePromptsEl.appendChild(badge);
            minuteBadges.set(minute, badge);
        });
    }

    function openModal(metricKey) {
        activeMetricKey = metricKey;
        const config = METRICS[metricKey];
        const currentValue = state.currentValues[metricKey];
        
        // SpO2とBorgの場合、デフォルト値と前回入力値の処理
        let defaultValue = null;
        if (metricKey === "spo2") {
            // 前回入力値がある場合はそれを使用、なければデフォルト95
            if (currentValue !== null) {
                defaultValue = currentValue;
            } else {
                // 既に記録された値がある場合はそれを使用
                const recordedValue = state.data[metricKey][0];
                defaultValue = recordedValue !== null ? recordedValue : 95;
            }
        } else if (metricKey === "borg") {
            // 前回入力値がある場合はそれを使用、なければデフォルト2
            if (currentValue !== null) {
                defaultValue = currentValue;
            } else {
                // 既に記録された値がある場合はそれを使用
                const recordedValue = state.data[metricKey][0];
                defaultValue = recordedValue !== null ? recordedValue : 2;
            }
        } else {
            // その他の指標は前回入力値があればそれを使用
            defaultValue = currentValue !== null ? currentValue : null;
        }
        
        modalTitle.textContent = config.label;
        
        // SpO2とBorgの場合はスクロールピッカーを表示、その他は数値入力
        if (metricKey === "spo2") {
            // SpO2スクロールピッカーを表示
            spo2PickerContainer.classList.remove("hidden");
            borgPickerContainer.classList.add("hidden");
            metricInput.classList.add("hidden");
            
            // スクロールピッカーを初期化
            initSpo2Picker(defaultValue || 95);
        } else if (metricKey === "borg") {
            // Borgスクロールピッカーを表示
            borgPickerContainer.classList.remove("hidden");
            spo2PickerContainer.classList.add("hidden");
            metricInput.classList.add("hidden");
            
            // スクロールピッカーを初期化
            initBorgPicker(defaultValue || 2);
        } else {
            // 数値入力フィールドを表示
            spo2PickerContainer.classList.add("hidden");
            borgPickerContainer.classList.add("hidden");
            metricInput.classList.remove("hidden");
            
            metricInput.type = "number";
            metricInput.min = String(config.min);
            metricInput.max = String(config.max);
            metricInput.step = config.step !== undefined ? String(config.step) : (config.allowDecimal ? "0.1" : "1");
            metricInput.setAttribute("inputmode", config.allowDecimal ? "decimal" : "numeric");
            metricInput.setAttribute("aria-label", `${config.label}の入力`);
            metricInput.setAttribute("pattern", config.allowDecimal ? "[0-9]+(\\\\.[0-9]+)?" : "[0-9]*");
            
            // 値を先に設定
            metricInput.value = defaultValue !== null
                ? (config.decimals > 0 ? defaultValue.toFixed(config.decimals).replace(/\.0+$/, "") : String(defaultValue))
                : "";
        }

        if (!state.timer.started) {
            modalNote.textContent = "開始前の基準値として保存されます。";
        } else {
            modalNote.textContent = "現在の測定値を更新します。記録は決定ボタンで行います。";
        }

        // モーダルを表示する前に値を設定済みにする
        modal.classList.remove("hidden");
        syncModalOpenState();
        
        // 数値入力の場合のみフォーカス
        if (metricKey !== "spo2") {
            setTimeout(() => {
                metricInput.focus({ preventScroll: true });
            }, 100);
        }
    }

    function closeModal() {
        modal.classList.add("hidden");
        activeMetricKey = null;
        syncModalOpenState();
    }

    // SpO2スクロールピッカーの初期化
    function initSpo2Picker(defaultValue = 95) {
        const MIN_VALUE = 70;
        const MAX_VALUE = 100;
        const ITEM_HEIGHT = 50;
        
        // 既存のアイテムをクリア
        spo2PickerScroll.innerHTML = "";
        
        // ピッカーアイテムを生成
        for (let i = MIN_VALUE; i <= MAX_VALUE; i++) {
            const item = document.createElement("div");
            item.className = "spo2-picker-item";
            item.textContent = i;
            item.dataset.value = i;
            spo2PickerScroll.appendChild(item);
        }
        
        // デフォルト値にスクロール
        setTimeout(() => {
            scrollSpo2ToValue(defaultValue, false);
            updateSpo2Selection();
        }, 100);
        
        // スクロールイベントリスナーを設定（既存のものを削除してから追加）
        spo2PickerScroll.removeEventListener("scroll", handleSpo2Scroll);
        spo2PickerScroll.addEventListener("scroll", handleSpo2Scroll);
    }

    // SpO2スクロールピッカーのスクロール処理
    let spo2ScrollTimeout;
    function handleSpo2Scroll() {
        updateSpo2Selection();
        
        clearTimeout(spo2ScrollTimeout);
        spo2ScrollTimeout = setTimeout(() => {
            const currentValue = parseInt(spo2DisplayValue.textContent, 10);
            scrollSpo2ToValue(currentValue, true);
        }, 150);
    }

    // SpO2スクロールピッカーの選択更新
    function updateSpo2Selection() {
        const MIN_VALUE = 70;
        const ITEM_HEIGHT = 50;
        const scrollTop = spo2PickerScroll.scrollTop;
        const centerPosition = scrollTop + (spo2PickerScroll.clientHeight / 2);
        
        const items = spo2PickerScroll.querySelectorAll(".spo2-picker-item");
        let closestItem = null;
        let minDistance = Infinity;

        items.forEach(item => {
            const itemTop = item.offsetTop;
            const itemCenter = itemTop + (ITEM_HEIGHT / 2);
            const distance = Math.abs(centerPosition - itemCenter);

            // アイテムのスタイルを更新
            if (distance < ITEM_HEIGHT) {
                const scale = 1 - (distance / ITEM_HEIGHT) * 0.5;
                item.style.opacity = scale;
                if (distance < ITEM_HEIGHT / 2) {
                    item.classList.add("active");
                } else {
                    item.classList.remove("active");
                }
            } else {
                item.style.opacity = 0.3;
                item.classList.remove("active");
            }

            // 最も近いアイテムを記録
            if (distance < minDistance) {
                minDistance = distance;
                closestItem = item;
            }
        });

        // 現在の値を更新
        if (closestItem) {
            const value = parseInt(closestItem.dataset.value, 10);
            spo2DisplayValue.textContent = value;
        }
    }

    // SpO2スクロールピッカーの値を指定位置にスクロール
    function scrollSpo2ToValue(value, smooth = true) {
        const MIN_VALUE = 70;
        const ITEM_HEIGHT = 50;
        const index = value - MIN_VALUE;
        const scrollPosition = index * ITEM_HEIGHT;
        spo2PickerScroll.scrollTo({
            top: scrollPosition,
            behavior: smooth ? "smooth" : "auto"
        });
    }

    // Borgスクロールピッカーの初期化
    function initBorgPicker(defaultValue = 2) {
        const MIN_VALUE = 0;
        const MAX_VALUE = 10;
        const ITEM_HEIGHT = 50;
        
        // 既存のアイテムをクリア
        borgPickerScroll.innerHTML = "";
        
        // ピッカーアイテムを生成（0から10まで整数）
        for (let i = MIN_VALUE; i <= MAX_VALUE; i++) {
            const item = document.createElement("div");
            item.className = "spo2-picker-item";
            item.textContent = i;
            item.dataset.value = i;
            borgPickerScroll.appendChild(item);
        }
        
        // デフォルト値にスクロール
        setTimeout(() => {
            scrollBorgToValue(defaultValue, false);
            updateBorgSelection();
        }, 100);
        
        // スクロールイベントリスナーを設定（既存のものを削除してから追加）
        borgPickerScroll.removeEventListener("scroll", handleBorgScroll);
        borgPickerScroll.addEventListener("scroll", handleBorgScroll);
    }

    // Borgスクロールピッカーのスクロール処理
    let borgScrollTimeout;
    function handleBorgScroll() {
        updateBorgSelection();
        
        clearTimeout(borgScrollTimeout);
        borgScrollTimeout = setTimeout(() => {
            const currentValue = parseFloat(borgDisplayValue.textContent);
            scrollBorgToValue(currentValue, true);
        }, 150);
    }

    // Borgスクロールピッカーの選択更新
    function updateBorgSelection() {
        const MIN_VALUE = 0;
        const ITEM_HEIGHT = 50;
        const scrollTop = borgPickerScroll.scrollTop;
        const centerPosition = scrollTop + (borgPickerScroll.clientHeight / 2);
        
        const items = borgPickerScroll.querySelectorAll(".spo2-picker-item");
        let closestItem = null;
        let minDistance = Infinity;

        items.forEach(item => {
            const itemTop = item.offsetTop;
            const itemCenter = itemTop + (ITEM_HEIGHT / 2);
            const distance = Math.abs(centerPosition - itemCenter);

            // アイテムのスタイルを更新
            if (distance < ITEM_HEIGHT) {
                const scale = 1 - (distance / ITEM_HEIGHT) * 0.5;
                item.style.opacity = scale;
                if (distance < ITEM_HEIGHT / 2) {
                    item.classList.add("active");
                } else {
                    item.classList.remove("active");
                }
            } else {
                item.style.opacity = 0.3;
                item.classList.remove("active");
            }

            // 最も近いアイテムを記録
            if (distance < minDistance) {
                minDistance = distance;
                closestItem = item;
            }
        });

        // 現在の値を更新
        if (closestItem) {
            const value = parseInt(closestItem.dataset.value, 10);
            borgDisplayValue.textContent = value;
        }
    }

    // Borgスクロールピッカーの値を指定位置にスクロール
    function scrollBorgToValue(value, smooth = true) {
        const MIN_VALUE = 0;
        const ITEM_HEIGHT = 50;
        const index = Math.round(value - MIN_VALUE);
        const scrollPosition = index * ITEM_HEIGHT;
        borgPickerScroll.scrollTo({
            top: scrollPosition,
            behavior: smooth ? "smooth" : "auto"
        });
    }

    function saveCurrentEntry() {
        if (!activeMetricKey) return;
        const config = METRICS[activeMetricKey];
        
        let parsedValue;
        
        // SpO2とBorgの場合はスクロールピッカーから値を取得
        if (activeMetricKey === "spo2") {
            parsedValue = parseInt(spo2DisplayValue.textContent, 10);
        } else if (activeMetricKey === "borg") {
            parsedValue = parseInt(borgDisplayValue.textContent, 10);
        } else {
            const rawValue = metricInput.value.trim();
            if (rawValue === "") {
                showToast("値を入力してください。", 2000);
                return;
            }
            parsedValue = config.allowDecimal ? parseFloat(rawValue) : parseInt(rawValue, 10);
        }

        if (Number.isNaN(parsedValue)) {
            showToast("数値を入力してください。", 2000);
            return;
        }

        if (parsedValue < config.min || parsedValue > config.max) {
            showToast(`${config.label}は${config.min}〜${config.max}${config.unit}で入力してください。`, 2600);
            return;
        }

        const normalizedValue = config.decimals > 0
            ? Number(parsedValue.toFixed(config.decimals))
            : Math.round(parsedValue);

        state.currentValues[activeMetricKey] = normalizedValue;

        if (!state.timer.started && state.timer.elapsedMs === 0 && config.requiresBaseline) {
            state.data[activeMetricKey][0] = normalizedValue;
            updateMinuteBadges();
        }

        updatePanels();
        updateControlStates();
        updateCompletionView();
        closeModal();

        const message = state.timer.started
            ? `${config.label} の現在値を更新しました。`
            : `${config.label} 開始時値を設定しました。`;
        showToast(message, 2000);
    }

    function handleStartStopClick() {
        if (state.timer.completed) {
            showToast("リセット後に再開してください。", 2200);
            return;
        }

        if (!state.timer.started) {
            if (!canStartTimer()) {
                showToast("開始時の全項目を入力してください。", 2400);
                return;
            }
            startTimer();
            return;
        }

        if (state.timer.running) {
            pauseTimer();
        } else {
            resumeTimer();
        }
    }

    function startTimer() {
        if (state.timer.running) return;
        state.timer.started = true;
        state.timer.running = true;
        state.timer.completed = false;
        state.timer.startTimestamp = Date.now() - state.timer.elapsedMs;
        state.timer.intervalId = window.setInterval(onTimerTick, 200);
        updateControlStates();
        updateInputCue();
        updateMinuteBadges();
        showToast("計測を開始しました。", 2000);
    }

    function resumeTimer() {
        if (state.timer.running || !state.timer.started) return;
        state.timer.running = true;
        state.timer.startTimestamp = Date.now() - state.timer.elapsedMs;
        state.timer.intervalId = window.setInterval(onTimerTick, 200);
        updateControlStates();
        updateInputCue();
        updateMinuteBadges();
        showToast("計測を再開しました。", 2000);
    }

    function pauseTimer() {
        if (!state.timer.running) return;
        state.timer.running = false;
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
        state.timer.elapsedMs = Date.now() - state.timer.startTimestamp;
        updateTimerDisplay();
        updateControlStates();
        updateInputCue();
        updateMinuteBadges();
        showToast("一時停止しました。", 2000);
    }

    function onTimerTick() {
        const now = Date.now();
        state.timer.elapsedMs = now - state.timer.startTimestamp;
        updateTimerDisplay();
        updateInputCue();
        updateMinuteBadges();
        handleMinuteNotifications();
    }

    function stopTimerComplete() {
        if (state.timer.completed) return;
        state.timer.running = false;
        state.timer.completed = true;
        state.timer.elapsedMs = 6 * 60 * 1000;
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
        updateTimerDisplay();
        updateInputCue();
        updateControlStates();
        showToast("6分経過。歩行距離を入力し、決定で記録してください。", 3400);

        if (state.minuteRecorded.has(6)) {
            enterCompletionView();
        }
    }

    function handleMinuteNotifications() {
        const elapsedSeconds = Math.floor(state.timer.elapsedMs / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);

        if (elapsedMinutes > state.timer.lastPromptMinute && elapsedMinutes >= 1 && elapsedMinutes <= 6) {
            state.timer.lastPromptMinute = elapsedMinutes;
            if (elapsedMinutes < 6) {
                showToast(`${elapsedMinutes}分経過。各指標を更新してください。`, 3000);
            } else {
                stopTimerComplete();
            }
        }

        if (elapsedSeconds >= 360 && !state.timer.completed) {
            stopTimerComplete();
        }
    }

    function handleCommit() {
        if (!state.timer.started) {
            showToast("開始後に使用できます。", 2000);
            return;
        }

        const targetMinute = getActiveCommitMinute();
        if (targetMinute === null) {
            showToast("(not the right time)", 1800);
            return;
        }

        const requiredMetrics = REQUIRED_MINUTE_METRICS[targetMinute] || [];
        const missing = requiredMetrics.filter((metric) => state.currentValues[metric] === null);

        if (missing.length > 0) {
            const labels = missing.map((metric) => METRICS[metric].label).join("・");
            showToast(`${labels}が未入力です。`, 2600);
            return;
        }

        requiredMetrics.forEach((metricKey) => {
            state.data[metricKey][targetMinute] = state.currentValues[metricKey];
        });

        state.minuteRecorded.add(targetMinute);

        updateMinuteBadges();
        updatePanels();
        updateControlStates();
        updateInputCue();
        showToast(`${targetMinute}分目の値を記録しました。`, 2400);

        if (targetMinute === 6 && state.timer.completed) {
            enterCompletionView();
        }
    }

    function getActiveCommitMinute() {
        const elapsedSeconds = Math.floor(state.timer.elapsedMs / 1000);
        for (let minute = 1; minute <= 6; minute += 1) {
            const window = MINUTE_WINDOWS[minute];
            if (!window) continue;
            if (elapsedSeconds >= window.start && elapsedSeconds <= window.end) {
                return minute;
            }
        }
        return null;
    }

    function updatePanels() {
        panelButtons.forEach((button) => {
            const metricKey = button.dataset.metric;
            const config = METRICS[metricKey];
            const valueEl = button.querySelector("[data-metric-value]");
            const statusEl = button.querySelector("[data-metric-status]");

            const currentValue = state.currentValues[metricKey];
            valueEl.textContent = currentValue !== null
                ? formatMetricValue(currentValue, config)
                : "--";

            const latestMinute = findLatestMinuteWithData(state.data[metricKey]);
            if (latestMinute === null) {
                statusEl.textContent = "未入力";
            } else if (latestMinute === 0) {
                statusEl.textContent = "開始時入力済";
            } else if (metricKey === "distance" && latestMinute === 6) {
                statusEl.textContent = "最終距離入力済";
            } else {
                statusEl.textContent = `${latestMinute}分値入力済`;
            }
        });
    }

    function updateTimerDisplay() {
        const minutes = Math.floor(state.timer.elapsedMs / 60000);
        const seconds = Math.floor((state.timer.elapsedMs % 60000) / 1000);
        timerDisplayEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function updateInputCue() {
        inputCueEl.classList.remove("recorded");

        if (!state.timer.started) {
            inputCueEl.textContent = "開始前";
            return;
        }

        if (!completionView.classList.contains("hidden") && state.minuteRecorded.has(6)) {
            inputCueEl.textContent = "計測終了";
            return;
        }

        const activeMinute = getActiveCommitMinute();
        if (activeMinute !== null) {
            inputCueEl.textContent = `${activeMinute}分目の入力`;
            if (state.minuteRecorded.has(activeMinute)) {
                inputCueEl.classList.add("recorded");
            }
            return;
        }

        if (state.timer.completed) {
            inputCueEl.textContent = "計測終了";
            return;
        }

        inputCueEl.textContent = "測定中";
    }

    function updateMinuteBadges() {
        const activeMinute = getActiveCommitMinute();
        minuteBadges.forEach((badge, minute) => {
            const requiredMetrics = REQUIRED_MINUTE_METRICS[minute] || [];
            const isComplete = requiredMetrics.length > 0
                ? requiredMetrics.every((metric) => state.data[metric][minute] !== null)
                : false;
            const hasAnyValue = Object.values(state.data).some((values) => values[minute] !== null);
            badge.classList.toggle("completed", isComplete);
            badge.classList.toggle("active", minute === activeMinute);
            if (minute === 0) {
                badge.classList.toggle("recorded", !isComplete && hasAnyValue);
            } else {
                badge.classList.toggle("recorded", !isComplete && state.minuteRecorded.has(minute));
            }
        });

        const baselineComplete = (REQUIRED_MINUTE_METRICS[0] || []).every((metric) => state.data[metric][0] !== null);
        const baselineBadge = minuteBadges.get(0);
        if (baselineBadge) {
            baselineBadge.classList.toggle("completed", baselineComplete);
            baselineBadge.classList.toggle("active", !state.timer.started && baselineComplete);
        }
    }

    function updateControlStates() {
        const baselineReady = canStartTimer();

        startStopBtn.classList.remove("paused", "running");

        if (!state.timer.started) {
            if (baselineReady) {
                startStopBtn.textContent = "Start";
            } else {
                startStopBtn.textContent = "開始時数値を入力";
            }
            startStopBtn.disabled = !baselineReady;
            if (startStopBtn.disabled) {
                startStopBtn.classList.add("paused");
            }
        } else if (state.timer.completed) {
            startStopBtn.textContent = "Restart";
            startStopBtn.disabled = true;
            startStopBtn.classList.add("paused");
        } else if (state.timer.running) {
            startStopBtn.textContent = "Stop";
            startStopBtn.disabled = false;
            startStopBtn.classList.add("running");
        } else {
            startStopBtn.textContent = "Resume";
            startStopBtn.disabled = false;
            startStopBtn.classList.add("paused");
        }

        startStopBtn.classList.toggle("disabled-state", startStopBtn.disabled);

        resetBtn.disabled = !state.timer.started && !hasAnyData() && state.timer.elapsedMs === 0;
        const commitDisabled = !state.timer.started || (state.timer.completed && state.minuteRecorded.has(6));
        commitBtn.disabled = commitDisabled;
    }

    function canStartTimer() {
        return (REQUIRED_MINUTE_METRICS[0] || []).every((metric) => state.data[metric][0] !== null);
    }

    function hasAnyData() {
        return Object.values(state.data).some((arr) => arr.some((value) => value !== null));
    }

    function formatMetricValue(value, config) {
        if (typeof value !== "number") return "--";
        if (config.decimals > 0) {
            return `${value.toFixed(config.decimals).replace(/\.0+$/, "")}${config.unit}`;
        }
        return `${Math.round(value)}${config.unit}`;
    }

    function findLatestMinuteWithData(values) {
        for (let index = values.length - 1; index >= 0; index -= 1) {
            if (values[index] !== null && values[index] !== undefined) {
                return index;
            }
        }
        return null;
    }

    function enterCompletionView() {
        if (!state.minuteRecorded.has(6)) return;
        if (!completionView.classList.contains("hidden")) {
            updateCompletionView();
            updateRecoverySummary();
            return;
        }
        measurementView.classList.add("hidden");
        completionView.classList.remove("hidden");
        timerDisplayEl.classList.add("hidden");
        showRecordsBtn.classList.remove("hidden");
        showRecordsBtn.disabled = false;
        commitBtn.disabled = true;
        panelButtons.forEach((button) => {
            button.disabled = true;
        });
        
        // カウントダウン状態の初期化
        if (state.recoveryTimer.running) {
            // カウントダウン実行中の場合
            if (recoveryStartSection) {
                recoveryStartSection.classList.add("hidden");
            }
            if (recoveryCountdownSection) {
                recoveryCountdownSection.classList.remove("hidden");
            }
        } else {
            // カウントダウン未開始の場合
            if (recoveryCountdownSection) {
                recoveryCountdownSection.classList.add("hidden");
            }
            if (recoveryStartSection) {
                recoveryStartSection.classList.remove("hidden");
            }
        }
        
        updateCompletionView();
        updateRecoverySummary();
        updateInputCue();
        window.setTimeout(() => {
            recoveryMinutesInput.focus({ preventScroll: true });
        }, 120);
    }

    function exitCompletionView() {
        if (completionView.classList.contains("hidden")) return;
        completionView.classList.add("hidden");
        measurementView.classList.remove("hidden");
        timerDisplayEl.classList.remove("hidden");
        showRecordsBtn.classList.add("hidden");
        showRecordsBtn.disabled = true;
        panelButtons.forEach((button) => {
            button.disabled = false;
        });
    }

    function updateCompletionView() {
        const baselineSpo2 = state.data.spo2[0];
        if (baselineSpo2 !== null) {
            baselineSpo2ValueEl.textContent = formatMetricValue(baselineSpo2, METRICS.spo2);
        } else {
            baselineSpo2ValueEl.textContent = "--";
        }

        if (state.recoveryTime.minutes !== null) {
            recoveryMinutesInput.value = String(state.recoveryTime.minutes);
        } else {
            recoveryMinutesInput.value = "";
        }

        if (state.recoveryTime.seconds !== null) {
            recoverySecondsInput.value = String(state.recoveryTime.seconds);
        } else {
            recoverySecondsInput.value = "";
        }
    }

    function saveRecoveryTime() {
        if (!state.minuteRecorded.has(6)) {
            showToast("6分目の記録が完了していません。", 2200);
            return;
        }

        const rawMinutes = recoveryMinutesInput.value.trim();
        const rawSeconds = recoverySecondsInput.value.trim();
        const hasMinutes = rawMinutes !== "";
        const hasSeconds = rawSeconds !== "";

        if (!hasMinutes && !hasSeconds) {
            showToast("回復時間を入力してください。", 2200);
            return;
        }

        const minutes = hasMinutes ? parseInt(rawMinutes, 10) : 0;
        const seconds = hasSeconds ? parseInt(rawSeconds, 10) : 0;

        if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
            showToast("数値を入力してください。", 2000);
            return;
        }

        if (minutes < 0 || minutes > 30) {
            showToast("分は0〜30で入力してください。", 2400);
            return;
        }

        if (seconds < 0 || seconds > 59) {
            showToast("秒は0〜59で入力してください。", 2400);
            return;
        }

        state.recoveryTime.minutes = minutes;
        state.recoveryTime.seconds = seconds;
        recoveryMinutesInput.value = String(minutes);
        recoverySecondsInput.value = String(seconds);
        updateRecoverySummary();
        if (!recordModal.classList.contains("hidden")) {
            populateRecordTable();
        }
        showToast("回復時間を保存しました。", 2000);
    }

    function startRecoveryTimer() {
        if (state.recoveryTimer.running) return;
        
        state.recoveryTimer.running = true;
        state.recoveryTimer.startTimestamp = Date.now() - state.recoveryTimer.elapsedMs;
        state.recoveryTimer.intervalId = window.setInterval(updateRecoveryTimer, 100);
        
        // UIを切り替え
        if (recoveryStartSection) {
            recoveryStartSection.classList.add("hidden");
        }
        if (recoveryCountdownSection) {
            recoveryCountdownSection.classList.remove("hidden");
        }
        
        showToast("回復時間の計測を開始しました。", 2000);
    }

    function stopRecoveryTimer() {
        if (!state.recoveryTimer.running) return;
        
        state.recoveryTimer.running = false;
        if (state.recoveryTimer.intervalId) {
            clearInterval(state.recoveryTimer.intervalId);
            state.recoveryTimer.intervalId = null;
        }
        
        // 経過時間を分・秒に変換して保存
        const totalSeconds = Math.floor(state.recoveryTimer.elapsedMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        state.recoveryTime.minutes = minutes;
        state.recoveryTime.seconds = seconds;
        recoveryMinutesInput.value = String(minutes);
        recoverySecondsInput.value = String(seconds);
        
        // UIを切り替え
        if (recoveryCountdownSection) {
            recoveryCountdownSection.classList.add("hidden");
        }
        if (recoveryStartSection) {
            recoveryStartSection.classList.remove("hidden");
        }
        
        updateRecoverySummary();
        if (!recordModal.classList.contains("hidden")) {
            populateRecordTable();
        }
        showToast(`回復時間を記録しました: ${minutes}分${String(seconds).padStart(2, "0")}秒`, 3000);
    }

    function updateRecoveryTimer() {
        const now = Date.now();
        state.recoveryTimer.elapsedMs = now - state.recoveryTimer.startTimestamp;
        
        const totalSeconds = Math.floor(state.recoveryTimer.elapsedMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        if (recoveryTimerDisplay) {
            recoveryTimerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        }
    }

    function openRecordModal() {
        if (!state.minuteRecorded.has(6)) {
            showToast("6分目の記録が完了していません。", 2200);
            return;
        }
        populateRecordTable();
        updateRecoverySummary();
        recordModal.classList.remove("hidden");
        syncModalOpenState();
    }

    function closeRecordModal() {
        recordModal.classList.add("hidden");
        syncModalOpenState();
    }

    function populateRecordTable() {
        recordTableBody.innerHTML = "";
        MINUTES.forEach((minute) => {
            const row = document.createElement("tr");
            const labelCell = document.createElement("th");
            labelCell.scope = "row";
            labelCell.textContent = minute === 0 ? "開始" : `${minute}分`;
            row.appendChild(labelCell);

            METRIC_ORDER.forEach((metricKey) => {
                const cell = document.createElement("td");
                const value = state.data[metricKey][minute];
                cell.textContent = value !== null ? formatMetricValue(value, METRICS[metricKey]) : "--";
                row.appendChild(cell);
            });

            recordTableBody.appendChild(row);
        });

        const recoveryRow = document.createElement("tr");
        const recoveryLabel = document.createElement("th");
        recoveryLabel.scope = "row";
        recoveryLabel.textContent = "回復時間";
        recoveryRow.appendChild(recoveryLabel);

        const recoveryValueCell = document.createElement("td");
        recoveryValueCell.colSpan = METRIC_ORDER.length;
        recoveryValueCell.className = "recovery-total";
        if (state.recoveryTime.minutes !== null && state.recoveryTime.seconds !== null) {
            recoveryValueCell.textContent = formatRecoveryTime(state.recoveryTime.minutes, state.recoveryTime.seconds);
        } else {
            recoveryValueCell.textContent = "未入力";
        }
        recoveryRow.appendChild(recoveryValueCell);
        recordTableBody.appendChild(recoveryRow);
    }

    function updateRecoverySummary() {
        if (!recoverySummary) return;
        if (state.recoveryTime.minutes === null || state.recoveryTime.seconds === null) {
            recoverySummary.textContent = "回復時間：未入力";
            return;
        }
        recoverySummary.textContent = `回復時間：${formatRecoveryTime(state.recoveryTime.minutes, state.recoveryTime.seconds)}`;
    }

    function formatRecoveryTime(minutes, seconds) {
        const secPadded = String(seconds).padStart(2, "0");
        return `${minutes}分${secPadded}秒`;
    }

    function syncModalOpenState() {
        if (!modal.classList.contains("hidden") || !recordModal.classList.contains("hidden") || 
            !resetDialog.classList.contains("hidden") || !usageWarningDialog.classList.contains("hidden")) {
            document.body.classList.add("modal-open");
        } else {
            document.body.classList.remove("modal-open");
        }
    }

    function handleUsageClick() {
        // 計測が開始されている場合のみ警告を表示
        if (state.timer.started) {
            openUsageWarningDialog();
        } else {
            // 計測が開始されていない場合は直接遷移
            window.location.href = "usage.html";
        }
    }

    function openUsageWarningDialog() {
        usageWarningDialog.classList.remove("hidden");
        document.body.classList.add("dialog-open");
    }

    function closeUsageWarningDialog() {
        usageWarningDialog.classList.add("hidden");
        document.body.classList.remove("dialog-open");
    }

    function openResetDialog() {
        resetDialog.classList.remove("hidden");
        document.body.classList.add("dialog-open");
    }

    function closeResetDialog() {
        resetDialog.classList.add("hidden");
        document.body.classList.remove("dialog-open");
    }

    function performReset(showToastMessage = true) {
        state.timer.running = false;
        state.timer.started = false;
        state.timer.completed = false;
        state.timer.startTimestamp = null;
        state.timer.elapsedMs = 0;
        state.timer.lastPromptMinute = 0;
        if (state.timer.intervalId) {
            clearInterval(state.timer.intervalId);
            state.timer.intervalId = null;
        }

        state.minuteRecorded.clear();
        state.recoveryTime.minutes = null;
        state.recoveryTime.seconds = null;
        
        // 回復時間カウントダウンのリセット
        if (state.recoveryTimer.intervalId) {
            clearInterval(state.recoveryTimer.intervalId);
            state.recoveryTimer.intervalId = null;
        }
        state.recoveryTimer.running = false;
        state.recoveryTimer.startTimestamp = null;
        state.recoveryTimer.elapsedMs = 0;
        
        // UIをリセット
        if (recoveryCountdownSection) {
            recoveryCountdownSection.classList.add("hidden");
        }
        if (recoveryStartSection) {
            recoveryStartSection.classList.remove("hidden");
        }
        if (recoveryTimerDisplay) {
            recoveryTimerDisplay.textContent = "00:00";
        }

        Object.keys(state.data).forEach((key) => {
            state.data[key] = MINUTES.map(() => null);
        });

        Object.keys(state.currentValues).forEach((key) => {
            state.currentValues[key] = null;
        });

        closeModal();
        closeRecordModal();
        closeResetDialog();
        clearToasts();
        exitCompletionView();
        recoveryMinutesInput.value = "";
        recoverySecondsInput.value = "";
        showRecordsBtn.classList.add("hidden");
        timerDisplayEl.classList.remove("hidden");
        updatePanels();
        updateTimerDisplay();
        updateMinuteBadges();
        updateControlStates();
        updateCompletionView();
        updateRecoverySummary();
        updateInputCue();

        if (showToastMessage) {
            showToast("リセットしました。開始時値を再入力してください。", 2800);
        }
    }

    function showToast(message, duration = 2600) {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.textContent = message;
        toastContainer.appendChild(toast);
        window.setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, duration);
    }

    function clearToasts() {
        toastContainer.innerHTML = "";
    }

    init();
})();
