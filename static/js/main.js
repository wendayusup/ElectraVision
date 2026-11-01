/**
 * ElectraVision - Pemindai komponen elektronika dengan my_model.pt
 * Logika: Live Vision Scanner, informasi komponen dari basis data JSON,
 *         dan Tampilan Dinamis Berdasarkan Pemindaian Real-Time
 */

document.addEventListener("DOMContentLoaded", () => {
    // Elemen DOM - Kamera & Canvas
    const webcamElement = document.getElementById("webcam");
    const canvasElement = document.getElementById("overlay");
    const ctx = canvasElement.getContext("2d");
    const cameraSelect = document.getElementById("cameraSelect");
    const flipCameraBtn = document.getElementById("flipCameraBtn");
    const pauseStreamBtn = document.getElementById("pauseStreamBtn");
    const pauseBtnText = document.getElementById("pauseBtnText");
    const cameraErrorMessage = document.getElementById("cameraErrorMessage");
    const fpsIndicator = document.getElementById("fpsIndicator");
    const resolutionIndicator = document.getElementById("resolutionIndicator");
    const scannerStatusLabel = document.getElementById("scannerStatusLabel");
    const modelStatusChip = document.getElementById("modelStatusChip");
    const modelStatusLabel = document.getElementById("modelStatusLabel");
    const componentListDialog = document.getElementById("componentListDialog");
    const componentListStatus = document.getElementById("componentListStatus");
    const componentListSummary = document.getElementById("componentListSummary");
    const componentListItems = document.getElementById("componentListItems");
    const closeComponentListBtn = document.getElementById("closeComponentListBtn");

    // Elemen DOM - Bagian Tampilan Adaptif
    const standbySection = document.getElementById("standbySection");
    const readoutBarSection = document.getElementById("readoutBarSection");
    const detailsSection = document.getElementById("detailsSection");

    // Elemen DOM - Bar Pembaca Real-Time
    const readoutStatusDot = document.getElementById("readoutStatusDot");
    const readoutStatusText = document.getElementById("readoutStatusText");
    const readoutTypeBadge = document.getElementById("readoutTypeBadge");
    const readoutComponentName = document.getElementById("readoutComponentName");
    const readoutConfidence = document.getElementById("readoutConfidence");
    const readoutCategory = document.getElementById("readoutCategory");

    // Elemen DOM - Karakteristik & Spesifikasi Teknis
    const componentDetails = document.getElementById("componentDetails");

    // State Internal
    let isProcessing = false;
    let isFrameLoopStarted = false;
    let isStreamPaused = false;
    let isMirrored = false;
    let cameraRequestId = 0;
    let currentDisplayKey = null;
    let detailsRequestId = 0;
    let hasScannedAnyItem = false;
    let modelComponentNames = null;

    // Meter FPS
    let frameCount = 0;
    let lastFpsTime = performance.now();

    async function refreshModelStatus() {
        try {
            const response = await fetch("/api/model-status");
            if (!response.ok) {
                throw new Error(`Status model gagal dimuat (${response.status})`);
            }

            const data = await response.json();
            const ready = data.status === "ready";
            modelStatusLabel.innerText = ready
                ? `Model siap · ${data.target_components_count} kelas`
                : "Model belum tersedia";
            modelStatusChip.classList.toggle("inactive", !ready);
            modelStatusChip.disabled = !ready;
        } catch (err) {
            console.error("Gagal memeriksa status model:", err);
            modelStatusLabel.innerText = "Status model tidak diketahui";
            modelStatusChip.classList.add("inactive");
            modelStatusChip.disabled = true;
        }
    }

    modelStatusChip.addEventListener("click", async () => {
        componentListDialog.showModal();
        modelStatusChip.setAttribute("aria-expanded", "true");
        componentListStatus.innerText = "Memuat daftar komponen...";
        componentListSummary.innerText = "";
        componentListItems.replaceChildren();
        componentListItems.hidden = true;

        try {
            if (modelComponentNames === null) {
                const response = await fetch("/api/components");
                if (!response.ok) {
                    throw new Error(`Daftar komponen gagal dimuat (${response.status})`);
                }

                const data = await response.json();
                if (!data.components || typeof data.components !== "object") {
                    throw new Error("Format daftar komponen tidak valid");
                }

                modelComponentNames = Object.values(data.components)
                    .map(component => component.name)
                    .filter(name => typeof name === "string")
                    .sort((first, second) => first.localeCompare(second, "id"));
            }

            if (modelComponentNames.length === 0) {
                throw new Error("Tidak ada nama komponen pada model aktif");
            }

            modelComponentNames.forEach(name => {
                const item = document.createElement("li");
                item.innerText = name;
                componentListItems.appendChild(item);
            });
            componentListSummary.innerText = `${modelComponentNames.length} nama komponen pada model aktif`;
            componentListStatus.innerText = "";
            componentListItems.hidden = false;
        } catch (err) {
            console.error("Gagal memuat daftar komponen model:", err);
            componentListStatus.innerText = "Daftar komponen gagal dimuat. Coba klik label lagi.";
        }
    });

    closeComponentListBtn.addEventListener("click", () => componentListDialog.close());
    componentListDialog.addEventListener("close", () => {
        modelStatusChip.setAttribute("aria-expanded", "false");
    });

    // -------------------------------------------------------------
    // 1. Inisialisasi Kamera
    // -------------------------------------------------------------
    async function initCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showCameraError("Kamera perlu dibuka melalui HTTPS atau localhost, dan browser harus mendukung akses kamera.");
            scannerStatusLabel.innerText = "Tidak didukung";
            scannerStatusChip.classList.add("inactive");
            return;
        }

        await startWebcam();
    }

    async function startWebcam(deviceId) {
        const requestId = ++cameraRequestId;
        const previousStream = webcamElement.srcObject;
        if (previousStream) {
            previousStream.getTracks().forEach(track => track.stop());
        }

        webcamElement.srcObject = null;
        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: deviceId ? undefined : { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (requestId !== cameraRequestId) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }

            window.stream = stream;
            showCameraError("");
            webcamElement.onloadedmetadata = () => {
                if (requestId !== cameraRequestId) return;
                canvasElement.width = webcamElement.videoWidth;
                canvasElement.height = webcamElement.videoHeight;
                resolutionIndicator.innerText = `Resolusi: ${webcamElement.videoWidth}x${webcamElement.videoHeight}`;
                scannerStatusLabel.innerText = "Aktif";
                scannerStatusChip.classList.remove("inactive");
                const videoTrack = stream.getVideoTracks()[0];
                const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
                refreshCameraOptions(settings.deviceId);
                if (!isFrameLoopStarted) {
                    isFrameLoopStarted = true;
                    processFrameLoop();
                }
            };
            webcamElement.srcObject = stream;
            await webcamElement.play();
        } catch (err) {
            console.error("Gagal mengakses stream webcam:", err);
            scannerStatusLabel.innerText = "Tidak Aktif";
            scannerStatusChip.classList.add("inactive");
            showCameraError(getCameraErrorMessage(err));
        }
    }

    async function refreshCameraOptions(activeDeviceId) {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === "videoinput");
            cameraSelect.replaceChildren();

            videoDevices.forEach((device, index) => {
                const option = document.createElement("option");
                option.value = device.deviceId;
                option.textContent = device.label || `Kamera ${index + 1}`;
                option.selected = device.deviceId === activeDeviceId;
                cameraSelect.appendChild(option);
            });
        } catch (err) {
            console.error("Gagal mendapatkan daftar kamera:", err);
        }
    }

    function showCameraError(message) {
        cameraErrorMessage.textContent = message;
        cameraErrorMessage.hidden = !message;
    }

    function getCameraErrorMessage(error) {
        if (!window.isSecureContext) {
            return "Akses kamera di ponsel memerlukan HTTPS. Gunakan localhost untuk pengujian di perangkat yang sama.";
        }
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
            return "Izin kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu muat ulang halaman.";
        }
        if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
            return "Kamera tidak ditemukan pada perangkat ini.";
        }
        if (error.name === "NotReadableError" || error.name === "TrackStartError") {
            return "Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
        }
        return "Kamera tidak dapat dibuka. Periksa izin kamera dan coba muat ulang halaman.";
    }

    cameraSelect.addEventListener("change", () => {
        startWebcam(cameraSelect.value);
    });

    flipCameraBtn.addEventListener("click", () => {
        isMirrored = !isMirrored;
        webcamElement.classList.toggle("mirrored", isMirrored);
        canvasElement.classList.toggle("mirrored", isMirrored);
        flipCameraBtn.classList.toggle("active", isMirrored);
    });

    const scannerStatusChip = document.getElementById("scannerStatusChip");
    pauseStreamBtn.addEventListener("click", () => {
        isStreamPaused = !isStreamPaused;
        if (isStreamPaused) {
            webcamElement.pause(); // Freeze tampilan kamera
            pauseBtnText.innerText = "Lanjut";
            pauseStreamBtn.classList.add("active");
            scannerStatusLabel.innerText = "Tidak Aktif";
            scannerStatusChip.classList.add("inactive");
        } else {
            webcamElement.play();
            pauseBtnText.innerText = "Jeda";
            pauseStreamBtn.classList.remove("active");
            scannerStatusLabel.innerText = "Aktif";
            scannerStatusChip.classList.remove("inactive");
        }
    });

    // -------------------------------------------------------------
    // 2. Loop Pemrosesan Frame Real-Time
    // -------------------------------------------------------------
    function processFrameLoop() {
        if (!isProcessing && !isStreamPaused && webcamElement.readyState === 4) {
            isProcessing = true;
            captureAndSendFrame();
        }
        updateFpsCounter();
        requestAnimationFrame(() => setTimeout(processFrameLoop, 90)); // ~11 FPS stabil
    }

    function updateFpsCounter() {
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
            fpsIndicator.innerText = `FPS: ${fps}`;
            frameCount = 0;
            lastFpsTime = now;
        }
    }

    async function captureAndSendFrame() {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvasElement.width;
        tempCanvas.height = canvasElement.height;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.drawImage(webcamElement, 0, 0, tempCanvas.width, tempCanvas.height);

        tempCanvas.toBlob(async (blob) => {
            if (!blob) {
                isProcessing = false;
                return;
            }

            const formData = new FormData();
            formData.append("file", blob, "frame.jpg");

            try {
                const response = await fetch("/detect?confidence=0.20", {
                    method: "POST",
                    body: formData
                });

                if (response.ok) {
                    const data = await response.json();
                    renderDetections(data);
                }
            } catch (err) {
                console.error("Kesalahan jaringan frame:", err);
            } finally {
                isProcessing = false;
            }
        }, "image/jpeg", 0.72);
    }

    // -------------------------------------------------------------
    // 3. Render Deteksi & Transisi Tampilan Dinamis
    // -------------------------------------------------------------
    function renderDetections(data) {
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // Jika tidak ada komponen yang terdeteksi pada frame ini
        if (!data.detections || data.detections.length === 0) {
            // Locking logic: Jika sebelumnya sudah ada komponen yang terdeteksi,
            // rincian teknis TETAP BERTAHAN di layar tanpa dihapus/di-reset.
            if (hasScannedAnyItem) {
                if (readoutStatusDot) readoutStatusDot.className = "readout-dot locked";
                if (readoutStatusText) readoutStatusText.innerText = "TERKUNCI";
            }
            return;
        }

        // Ambil hasil deteksi unik untuk mencegah nama berulang memenuhi panel.
        const primary = data.detections[0];
        const info = primary.component_info;
        const multipleDetections = data.detections.length > 1;
        const uniqueDetections = [...new Map(
            data.detections.map(item => [item.normalized_id, item])
        ).values()];

        // Gambar Bounding Box Presisi pada Layar
        data.detections.forEach((item) => {
            const [x1, y1, x2, y2] = item.box;
            const w = x2 - x1;
            const h = y2 - y1;

            ctx.strokeStyle = "#b87932";
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x1, y1, w, h);

            // Aksen Sudut Pemindai
            const cornerLen = 14;
            ctx.strokeStyle = "#ffd083";
            ctx.lineWidth = 3.5;
            // Top-left
            ctx.beginPath();
            ctx.moveTo(x1, y1 + cornerLen);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x1 + cornerLen, y1);
            ctx.stroke();
            // Top-right
            ctx.beginPath();
            ctx.moveTo(x2 - cornerLen, y1);
            ctx.lineTo(x2, y1);
            ctx.lineTo(x2, y1 + cornerLen);
            ctx.stroke();
            // Bottom-left
            ctx.beginPath();
            ctx.moveTo(x1, y2 - cornerLen);
            ctx.lineTo(x1, y2);
            ctx.lineTo(x1 + cornerLen, y2);
            ctx.stroke();
            // Bottom-right
            ctx.beginPath();
            ctx.moveTo(x2 - cornerLen, y2);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x2, y2 - cornerLen);
            ctx.stroke();

            // Label Box
            const labelText = multipleDetections
                ? item.label
                : `${item.label} (${item.confidence}%)`;
            ctx.font = "600 13px Poppins, sans-serif";
            const textWidth = ctx.measureText(labelText).width;
            const tagHeight = 24;
            const tagY = y1 > 28 ? y1 - tagHeight : y1;

            ctx.fillStyle = "rgba(43, 26, 15, 0.94)";
            ctx.fillRect(x1, tagY, textWidth + 16, tagHeight);

            ctx.fillStyle = "#ffe0a6";
            ctx.fillText(labelText, x1 + 8, tagY + 16);
        });

        // Tampilkan Bar & Panel jika baru pertama kali terdeteksi
        if (!hasScannedAnyItem) {
            hasScannedAnyItem = true;
            standbySection.style.display = "none";
            readoutBarSection.style.display = "block";
            detailsSection.style.display = "flex";
            readoutBarSection.classList.add("panel-appear");
            detailsSection.classList.add("panel-appear");
        }

        // Status aktif pemindaian
        if (readoutStatusDot) readoutStatusDot.className = "readout-dot detected";
        if (readoutStatusText) readoutStatusText.innerText = "TERDETEKSI";

        const displayKey = multipleDetections
            ? `multiple:${uniqueDetections.map(item => item.normalized_id).sort().join("|")}`
            : `single:${info.id}`;

        if (currentDisplayKey !== displayKey) {
            currentDisplayKey = displayKey;
            const requestId = ++detailsRequestId;
            readoutTypeBadge.innerText = multipleDetections
                ? "NAMA KOMPONEN TERDETEKSI:"
                : "KOMPONEN TERDETEKSI:";
            readoutComponentName.innerText = multipleDetections
                ? uniqueDetections.map(item => item.label).join(", ")
                : info.name;
            readoutCategory.style.display = multipleDetections ? "none" : "inline-block";

            if (multipleDetections) {
                renderDetectedNames(uniqueDetections, requestId);
            } else {
                readoutCategory.innerText = info.category || "Komponen Elektronika";
                renderComponentDetails(info, requestId);
            }
        }

        const confidenceBox = readoutConfidence.closest(".meta-box");
        confidenceBox.style.display = multipleDetections ? "none" : "flex";
        if (!multipleDetections) {
            readoutConfidence.innerText = `${primary.confidence}%`;
        }
    }

    // -------------------------------------------------------------
    // 4. Perbarui Panel Karakteristik & Spesifikasi Teknis
    // -------------------------------------------------------------
    function renderDetectedNames(items, requestId) {
        componentDetails.replaceChildren();
        const list = document.createElement("ul");
        list.className = "detected-name-list";
        items.forEach(item => {
            const entry = document.createElement("li");
            entry.innerText = item.label;
            list.appendChild(entry);
        });
        componentDetails.appendChild(list);

        items.forEach(item => {
            const group = document.createElement("section");
            group.className = "detected-project-group";
            const heading = document.createElement("h3");
            heading.innerText = item.label;
            group.appendChild(heading);
            componentDetails.appendChild(group);
            loadProjectIdeas(group, item.normalized_id, requestId);
        });
    }

    function appendTextBlock(container, title, text, className = "") {
        if (!text) return;
        const block = document.createElement("section");
        block.className = `component-info-block ${className}`.trim();
        const heading = document.createElement("h3");
        heading.innerText = title;
        const content = document.createElement("p");
        content.innerText = text;
        block.append(heading, content);
        container.appendChild(block);
    }

    function loadProjectIdeas(container, componentId, requestId) {
        fetch(`/api/components/${encodeURIComponent(componentId)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Rekomendasi proyek gagal dimuat (${response.status})`);
                }
                return response.json();
            })
            .then(data => {
                if (requestId !== detailsRequestId || !container.isConnected) return;

                const heading = document.createElement("h3");
                heading.innerText = `Ide proyek untuk ${data.component.name}`;
                container.appendChild(heading);

                const ideas = data.component.project_ideas || [];
                if (ideas.length === 0) {
                    appendTextBlock(container, "Ide proyek", "Belum ada rekomendasi proyek untuk komponen ini.");
                    return;
                }

                const list = document.createElement("ol");
                list.className = "project-idea-list";
                ideas.forEach(idea => {
                    const item = document.createElement("li");
                    const title = document.createElement("h4");
                    title.innerText = idea.name;
                    const description = document.createElement("p");
                    description.innerText = idea.description;
                    item.append(title, description);

                    if (idea.components && idea.components.length > 0) {
                        const components = document.createElement("p");
                        components.className = "project-idea-components";
                        components.innerText = `Komponen utama: ${idea.components.join(", ")}`;
                        item.appendChild(components);
                    }

                    list.appendChild(item);
                });
                container.appendChild(list);

                if (data.project_recommendations_note) {
                    const note = document.createElement("p");
                    note.className = "project-recommendations-note";
                    note.innerText = data.project_recommendations_note;
                    container.appendChild(note);
                }
            })
            .catch(error => {
                if (requestId !== detailsRequestId || !container.isConnected) return;
                console.error("Gagal memuat rekomendasi proyek:", error);
                appendTextBlock(
                    container,
                    "Ide proyek",
                    "Rekomendasi proyek tidak dapat dimuat. Coba pindai komponen lagi."
                );
            });
    }

    function renderComponentDetails(info, requestId) {
        componentDetails.replaceChildren();
        componentDetails.className = "component-details";

        const summary = document.createElement("div");
        summary.className = "component-info-grid";
        appendTextBlock(summary, "Kategori", info.category);
        appendTextBlock(summary, "Fungsi", info.function);
        componentDetails.appendChild(summary);

        (info.pinout_groups || []).forEach(group => {
            const block = document.createElement("section");
            block.className = "component-info-block pinout-block";
            const heading = document.createElement("h3");
            heading.innerText = group.judul || "Pinout";
            block.appendChild(heading);

            const list = document.createElement("dl");
            list.className = "pinout-list";
            (group.items || []).forEach(item => {
                const pin = document.createElement("dt");
                pin.innerText = item.pin || "";
                const functionText = document.createElement("dd");
                functionText.innerText = item.fungsi || "—";
                list.append(pin, functionText);
            });
            block.appendChild(list);
            componentDetails.appendChild(block);
        });

        appendTextBlock(componentDetails, "Cara menghubungkan", info.connection);
        appendTextBlock(componentDetails, "Peringatan", info.warnings, "warning-block");
        appendTextBlock(componentDetails, "Catatan pinout", info.pinout_note);

        (info.additional_info || []).forEach(item => {
            appendTextBlock(componentDetails, item.judul || "Informasi tambahan", item.isi);
        });

        if (info.references && info.references.length > 0) {
            const block = document.createElement("section");
            block.className = "component-info-block reference-block";
            const heading = document.createElement("h3");
            heading.innerText = "Referensi";
            const list = document.createElement("ul");
            info.references.forEach(reference => {
                const entry = document.createElement("li");
                const link = document.createElement("a");
                link.innerText = reference.judul || reference.url;
                try {
                    const url = new URL(reference.url);
                    if (url.protocol === "https:" || url.protocol === "http:") {
                        link.href = url.href;
                        link.target = "_blank";
                        link.rel = "noopener noreferrer";
                    }
                } catch {
                    link.innerText = reference.judul || "Referensi tidak valid";
                }
                entry.appendChild(link);
                list.appendChild(entry);
            });
            block.append(heading, list);
            componentDetails.appendChild(block);
        }

        const projectIdeas = document.createElement("section");
        projectIdeas.className = "component-project-ideas";
        componentDetails.appendChild(projectIdeas);
        loadProjectIdeas(projectIdeas, info.id, requestId);
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Jalankan inisialisasi kamera
    refreshModelStatus();
    window.setInterval(refreshModelStatus, 5000);
    initCamera();
});