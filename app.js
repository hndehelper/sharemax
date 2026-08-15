// =========================================================
// ShareMax — iOS 13 High-Speed Local Wi-Fi Sharing Logic
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    // App State
    let currentServerIp = window.location.hostname || '127.0.0.1';
    let currentServerPort = window.location.port || '8080';
    let currentServerUrl = getCleanBaseUrl();
    let allFiles = [];
    let activeFilter = 'all';
    let isUploading = false;

    // Room PIN & Peer State
    let currentRoomPin = getOrInitRoomPin();
    let myDeviceId = 'dev_' + Math.random().toString(36).substr(2, 6);
    let myDeviceInfo = getDeviceTypeInfo();
    let activeDevicesMap = new Map();
    let peerChannel = null;

    // DOM Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileGrid = document.getElementById('fileGrid');
    const emptyState = document.getElementById('emptyState');
    const fileCountBadge = document.getElementById('fileCountBadge');
    const ipAddressText = document.getElementById('ipAddressText');
    const serverFullUrl = document.getElementById('serverFullUrl');
    const lanUrlBox = document.getElementById('lanUrlBox');
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    const refreshFilesBtn = document.getElementById('refreshFilesBtn');
    const uploadProgressBox = document.getElementById('uploadProgressBox');
    const uploadFileName = document.getElementById('uploadFileName');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    const uploadPercentage = document.getElementById('uploadPercentage');
    const uploadSpeed = document.getElementById('uploadSpeed');
    const uploadStatusText = document.getElementById('uploadStatusText');

    // PIN & Nearby Device Elements
    const myRoomPin = document.getElementById('myRoomPin');
    const joinPinInput = document.getElementById('joinPinInput');
    const joinPinBtn = document.getElementById('joinPinBtn');
    const nearbyDevicesList = document.getElementById('nearbyDevicesList');
    const connectedDevicesCount = document.getElementById('connectedDevicesCount');

    // Text Sharing Elements
    const shareTextInput = document.getElementById('shareTextInput');
    const sendTextBtn = document.getElementById('sendTextBtn');
    const sharedTextsList = document.getElementById('sharedTextsList');

    // Modal Elements
    const previewModal = document.getElementById('previewModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalFileName = document.getElementById('modalFileName');
    const modalBody = document.getElementById('modalBody');
    const modalDownloadBtn = document.getElementById('modalDownloadBtn');
    
    const qrModal = document.getElementById('qrModal');
    const qrModalBtn = document.getElementById('qrModalBtn');
    const closeQrModalBtn = document.getElementById('closeQrModalBtn');
    const themeToggleBtn = document.getElementById('themeToggleBtn');

    // Helper: Clean Base URL (Preserves GitHub Pages subpath /sharemax/ to avoid 404)
    function getCleanBaseUrl() {
        let href = window.location.href.split('?')[0].split('#')[0];
        if (!href.endsWith('/') && !href.endsWith('.html')) {
            href += '/';
        }
        return href;
    }

    // Helper: Room PIN Init
    function getOrInitRoomPin() {
        const urlParams = new URLSearchParams(window.location.search);
        const pinFromUrl = urlParams.get('pin');
        if (pinFromUrl && pinFromUrl.trim().length >= 3) {
            return pinFromUrl.trim().toUpperCase();
        }
        let savedPin = localStorage.getItem('sharemax_room_pin');
        if (!savedPin) {
            savedPin = Math.floor(1000 + Math.random() * 9000).toString();
            localStorage.setItem('sharemax_room_pin', savedPin);
        }
        return savedPin;
    }

    // Helper: Device Detection
    function getDeviceTypeInfo() {
        const ua = navigator.userAgent;
        let name = 'Device';
        let icon = '💻';
        if (/iPhone|iPad|iPod/i.test(ua)) {
            name = 'iPhone (iOS)';
            icon = '📱';
        } else if (/Android/i.test(ua)) {
            name = 'Android Phone';
            icon = '🤖';
        } else if (/Macintosh|Mac OS X/i.test(ua)) {
            name = 'Mac Book';
            icon = '💻';
        } else if (/Windows/i.test(ua)) {
            name = 'Windows PC';
            icon = '💻';
        }
        return { name, icon };
    }

    // 1. Initialize App & Fetch Server Info
    initApp();

    async function initApp() {
        setupTabs();
        setupDragAndDrop();
        setupFilters();
        setupEventListeners();
        setupPinAndPeerChannel();
        await fetchServerInfo();
        await fetchFiles();
        await fetchSharedText();
        
        // Periodic auto-refresh every 3 seconds
        setInterval(() => {
            if (!isUploading) {
                fetchFiles(true);
                fetchSharedText();
            }
        }, 3000);
    }

    // 1.5 Setup PIN & Broadcast Channel
    function setupPinAndPeerChannel() {
        if (myRoomPin) myRoomPin.textContent = currentRoomPin;
        if (joinPinInput) joinPinInput.value = currentRoomPin;

        // Register self in active devices
        activeDevicesMap.set(myDeviceId, {
            id: myDeviceId,
            name: myDeviceInfo.name + ' (You)',
            icon: myDeviceInfo.icon,
            pin: currentRoomPin,
            lastSeen: Date.now(),
            isMe: true
        });
        renderNearbyDevices();

        // BroadcastChannel for instant local tab/device sync
        try {
            if (peerChannel) peerChannel.close();
            peerChannel = new BroadcastChannel('sharemax_room_' + currentRoomPin);
            
            peerChannel.onmessage = (e) => {
                const msg = e.data;
                if (!msg) return;

                if (msg.type === 'ping') {
                    activeDevicesMap.set(msg.deviceId, {
                        id: msg.deviceId,
                        name: msg.deviceName,
                        icon: msg.deviceIcon,
                        pin: msg.pin,
                        lastSeen: Date.now(),
                        isMe: false
                    });
                    renderNearbyDevices();
                } else if (msg.type === 'file_added') {
                    fetchFiles(true);
                } else if (msg.type === 'text_added') {
                    fetchSharedText();
                }
            };

            // Send ping heartbeat every 2s
            setInterval(() => {
                if (peerChannel) {
                    peerChannel.postMessage({
                        type: 'ping',
                        deviceId: myDeviceId,
                        deviceName: myDeviceInfo.name,
                        deviceIcon: myDeviceInfo.icon,
                        pin: currentRoomPin
                    });
                }
                cleanupStaleDevices();
            }, 2000);
        } catch (e) {
            console.log('BroadcastChannel not supported in this browser.');
        }

        // Handle Join PIN button click
        if (joinPinBtn && joinPinInput) {
            joinPinBtn.addEventListener('click', () => {
                const inputVal = joinPinInput.value.trim().toUpperCase();
                if (inputVal.length >= 3) {
                    currentRoomPin = inputVal;
                    localStorage.setItem('sharemax_room_pin', currentRoomPin);
                    if (myRoomPin) myRoomPin.textContent = currentRoomPin;
                    setupPinAndPeerChannel();
                    updateShareUrlsAndQRCodes();
                    fetchFiles();
                    fetchSharedText();
                    showToast(`🔑 Joined Room PIN: ${currentRoomPin}`);
                } else {
                    showToast('⚠️ Please enter a valid PIN');
                }
            });
        }
    }

    function cleanupStaleDevices() {
        const now = Date.now();
        let changed = false;
        activeDevicesMap.forEach((device, id) => {
            if (!device.isMe && (now - device.lastSeen > 6000)) {
                activeDevicesMap.delete(id);
                changed = true;
            }
        });
        if (changed) renderNearbyDevices();
    }

    function renderNearbyDevices() {
        if (!nearbyDevicesList) return;
        nearbyDevicesList.innerHTML = '';
        
        const count = activeDevicesMap.size;
        if (connectedDevicesCount) {
            connectedDevicesCount.textContent = `${count} Device${count > 1 ? 's' : ''} Connected (PIN ${currentRoomPin})`;
        }

        activeDevicesMap.forEach((device) => {
            const chip = document.createElement('div');
            chip.className = `nearby-device-chip ${device.isMe ? 'is-me' : ''}`;
            chip.innerHTML = `
                <span class="dev-icon">${device.icon}</span>
                <div class="dev-details">
                    <span class="dev-title">${escapeHtml(device.name)}</span>
                    <span class="dev-sub">PIN: ${device.pin}</span>
                </div>
            `;
            nearbyDevicesList.appendChild(chip);
        });
    }

    // 2. Fetch Server Info & Generate QR Codes
    async function fetchServerInfo() {
        try {
            const res = await fetch('/api/info');
            if (res.ok) {
                const data = await res.json();
                if (data.ip) currentServerIp = data.ip;
                if (data.port) currentServerPort = data.port;
                currentServerUrl = `http://${currentServerIp}:${currentServerPort}/`;
            } else {
                currentServerUrl = getCleanBaseUrl();
            }
        } catch (e) {
            currentServerUrl = getCleanBaseUrl();
        }

        updateShareUrlsAndQRCodes();
    }

    function updateShareUrlsAndQRCodes() {
        let finalShareUrl = currentServerUrl;
        if (finalShareUrl.includes('github.io') || finalShareUrl.includes('localhost') || !finalShareUrl.includes('?')) {
            finalShareUrl = getCleanBaseUrl() + `?pin=${currentRoomPin}`;
        }

        if (ipAddressText) ipAddressText.textContent = `IP: ${currentServerIp}`;
        if (serverFullUrl) serverFullUrl.textContent = finalShareUrl;
        
        const codeDisplay = document.getElementById('codeUrlDisplay');
        const guideUrl = document.getElementById('guideQrUrl');
        const popupUrl = document.getElementById('popupQrUrl');

        if (codeDisplay) codeDisplay.textContent = finalShareUrl;
        if (guideUrl) guideUrl.textContent = finalShareUrl;
        if (popupUrl) popupUrl.textContent = finalShareUrl;

        // Render QR Code with PIN included
        renderQRCodes(finalShareUrl);
    }

    function renderQRCodes(url) {
        if (window.QRCodeGen) {
            try {
                window.QRCodeGen.create(url, 'tabQrCodeCanvas', 200);
                window.QRCodeGen.create(url, 'popupQrCanvas', 220);
            } catch (err) {
                console.error('QR Code render error:', err);
            }
        }
    }

    // 3. Tab Switching Logic
    function setupTabs() {
        const segmentBtns = document.querySelectorAll('.segment-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        segmentBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                segmentBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const targetTab = document.getElementById(targetId);
                if (targetTab) targetTab.classList.add('active');

                // If opening QR tab, re-render QR
                if (targetId === 'tabGuide') {
                    renderQRCodes(currentServerUrl);
                }
            });
        });
    }

    // 4. File Library Fetching & Rendering
    async function fetchFiles(silent = false) {
        try {
            const res = await fetch('/api/files');
            if (res.ok) {
                const data = await res.json();
                allFiles = data || [];
                fileCountBadge.textContent = allFiles.length;
                renderFileList();
            }
        } catch (err) {
            if (!silent) console.error('Failed to fetch files:', err);
        }
    }

    function renderFileList() {
        const filtered = allFiles.filter(file => {
            if (activeFilter === 'all') return true;
            return getFileCategory(file.name) === activeFilter;
        });

        if (filtered.length === 0) {
            emptyState.style.display = 'block';
            fileGrid.innerHTML = '';
            fileGrid.appendChild(emptyState);
            return;
        }

        emptyState.style.display = 'none';
        fileGrid.innerHTML = '';

        filtered.forEach(file => {
            const card = createFileCard(file);
            fileGrid.appendChild(card);
        });
    }

    function getFileCategory(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'heic'].includes(ext)) return 'image';
        if (['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp', 'flv'].includes(ext)) return 'video';
        if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) return 'audio';
        if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'document';
        return 'other';
    }

    function createFileCard(file) {
        const category = getFileCategory(file.name);
        const iconSymbol = getCategoryIcon(category);
        const formattedSize = formatFileSize(file.size);
        const downloadUrl = file.url || `/files/${encodeURIComponent(file.name)}`;

        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-icon-box ${category}">
                ${iconSymbol}
            </div>
            <div class="file-info">
                <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                <div class="file-meta">
                    <span>${formattedSize}</span>
                    <span>•</span>
                    <span>${file.modified || 'Just now'}</span>
                </div>
            </div>
            <div class="file-actions">
                <button class="action-btn preview-btn" title="Preview / Play">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <a href="${downloadUrl}" class="action-btn download-btn" download="${escapeHtml(file.name)}" title="Download">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </a>
            </div>
        `;

        card.querySelector('.preview-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openPreviewModal(file, downloadUrl);
        });

        return card;
    }

    function getCategoryIcon(category) {
        switch (category) {
            case 'image': return '📷';
            case 'video': return '🎬';
            case 'audio': return '🎵';
            case 'document': return '📄';
            default: return '📦';
        }
    }

    // 5. File Drag & Drop + Upload Engine
    function setupDragAndDrop() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                handleFileUploads(files);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleFileUploads(fileInput.files);
            }
        });
    }

    async function handleFileUploads(filesList) {
        const files = Array.from(filesList);
        for (let i = 0; i < files.length; i++) {
            await uploadSingleFile(files[i], i + 1, files.length);
        }
        fetchFiles();
        showToast('✅ All files uploaded successfully over Wi-Fi!');
    }

    function uploadSingleFile(file, currentIndex, totalFiles) {
        return new Promise((resolve) => {
            isUploading = true;
            uploadProgressBox.style.display = 'block';
            uploadFileName.textContent = `(${currentIndex}/${totalFiles}) ${file.name}`;
            uploadProgressBar.style.width = '0%';
            uploadPercentage.textContent = '0%';
            uploadStatusText.textContent = 'Transferring over Hotspot...';

            const xhr = new XMLHttpRequest();
            const startTime = Date.now();

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    uploadProgressBar.style.width = `${percent}%`;
                    uploadPercentage.textContent = `${percent}%`;

                    const elapsedTime = (Date.now() - startTime) / 1000;
                    if (elapsedTime > 0) {
                        const speedMbps = ((e.loaded / (1024 * 1024)) / elapsedTime).toFixed(2);
                        uploadSpeed.textContent = `${speedMbps} MB/s`;
                    }
                }
            };

            xhr.onload = () => {
                isUploading = false;
                uploadProgressBox.style.display = 'none';
                if (xhr.status === 200 || xhr.status === 201) {
                    resolve();
                } else {
                    showToast(`⚠️ Upload error for ${file.name}`);
                    resolve();
                }
            };

            xhr.onerror = () => {
                isUploading = false;
                uploadProgressBox.style.display = 'none';
                showToast(`❌ Connection failed uploading ${file.name}`);
                resolve();
            };

            xhr.open('POST', '/upload', true);
            xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
            xhr.setRequestHeader('X-File-Size', file.size);
            xhr.send(file);
        });
    }

    // 6. Category Filtering
    function setupFilters() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.getAttribute('data-filter');
                renderFileList();
            });
        });
    }

    // 7. Instant Text & Link Sharing
    sendTextBtn.addEventListener('click', sendSharedText);
    shareTextInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            sendSharedText();
        }
    });

    async function sendSharedText() {
        const text = shareTextInput.value.trim();
        if (!text) return;

        try {
            const res = await fetch('/api/text', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: text
            });
            if (res.ok) {
                shareTextInput.value = '';
                showToast('📋 Text snippet shared!');
                fetchSharedText();
            }
        } catch (e) {
            showToast('⚠️ Error sharing text snippet');
        }
    }

    async function fetchSharedText() {
        try {
            const res = await fetch('/api/text');
            if (res.ok) {
                const data = await res.json();
                renderSharedTexts(data || []);
            }
        } catch (e) {}
    }

    function renderSharedTexts(texts) {
        if (!sharedTextsList) return;
        if (texts.length === 0) {
            sharedTextsList.innerHTML = `<div class="empty-state"><h4>No text snippets shared yet</h4><p>Type text above to copy between your iPhone and PC!</p></div>`;
            return;
        }

        sharedTextsList.innerHTML = '';
        texts.forEach(item => {
            const div = document.createElement('div');
            div.className = 'text-item-card';
            div.innerHTML = `
                <div>
                    <div class="text-content">${escapeHtml(item.text)}</div>
                    <div class="text-meta">Shared at ${item.time || 'Just now'}</div>
                </div>
                <button class="ios-btn primary copy-text-btn" style="padding: 6px 14px; font-size: 0.8rem;">Copy</button>
            `;

            div.querySelector('.copy-text-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(item.text);
                showToast('📋 Copied to Clipboard!');
            });

            sharedTextsList.appendChild(div);
        });
    }

    // 8. Preview Modal Engine
    function openPreviewModal(file, url) {
        modalFileName.textContent = file.name;
        modalDownloadBtn.href = url;
        modalDownloadBtn.setAttribute('download', file.name);

        const category = getFileCategory(file.name);
        modalBody.innerHTML = '';

        if (category === 'image') {
            const img = document.createElement('img');
            img.src = url;
            modalBody.appendChild(img);
        } else if (category === 'video') {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.autoplay = true;
            modalBody.appendChild(video);
        } else if (category === 'audio') {
            const audio = document.createElement('audio');
            audio.src = url;
            audio.controls = true;
            audio.autoplay = true;
            modalBody.appendChild(audio);
        } else {
            modalBody.innerHTML = `<div style="text-align:center; padding:30px;"><div style="font-size:3rem; margin-bottom:10px;">📄</div><p style="color:var(--text-secondary);">Binary file preview not supported directly. Tap download below!</p></div>`;
        }

        previewModal.classList.add('active');
    }

    closeModalBtn.addEventListener('click', () => previewModal.classList.remove('active'));
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) previewModal.classList.remove('active');
    });

    // 9. QR Modal Popup
    qrModalBtn.addEventListener('click', () => qrModal.classList.add('active'));
    closeQrModalBtn.addEventListener('click', () => qrModal.classList.remove('active'));
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) qrModal.classList.remove('active');
    });

    // 10. General Event Listeners
    function setupEventListeners() {
        copyUrlBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(currentServerUrl);
            showToast('🔗 Server URL copied to clipboard!');
        });

        refreshFilesBtn.addEventListener('click', () => {
            fetchFiles();
            showToast('🔄 Shared files refreshed');
        });

        themeToggleBtn.addEventListener('click', () => {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            showToast(`🌓 Switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} Mode`);
        });

        // Developer Modal Listeners
        const devContactModal = document.getElementById('devContactModal');
        const closeDevModalBtn = document.getElementById('closeDevModalBtn');
        const devBadgeClick = document.getElementById('devBadgeClick');
        const copyDevEmailBtn = document.getElementById('copyDevEmailBtn');

        if (devBadgeClick && devContactModal) {
            devBadgeClick.addEventListener('click', () => devContactModal.classList.add('active'));
        }
        if (closeDevModalBtn && devContactModal) {
            closeDevModalBtn.addEventListener('click', () => devContactModal.classList.remove('active'));
        }
        if (devContactModal) {
            devContactModal.addEventListener('click', (e) => {
                if (e.target === devContactModal) devContactModal.classList.remove('active');
            });
        }
        if (copyDevEmailBtn) {
            copyDevEmailBtn.addEventListener('click', () => {
                navigator.clipboard.writeText('34batchcivilengineering@gmail.com');
                showToast('✉️ Developer email copied to clipboard!');
            });
        }
    }

    // Utilities
    function showToast(message) {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
