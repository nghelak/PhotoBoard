// PhotoBoard - Area-Based Layout
// app.js

// ============ State ============
let currentMode = 'user'; // 'user' or 'admin'
let areas = [];
let activeArea = null;
let db = null; // IndexedDB instance

// ============ IndexedDB ============
const DB_NAME = 'PhotoBoardDB';
const DB_VERSION = 1;
const STORE_NAME = 'state';

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            console.warn('IndexedDB not supported, using localStorage');
            resolve(null);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.warn('IndexedDB error, falling back to localStorage');
            resolve(null);
        };

        request.onsuccess = (e) => {
            resolve(e.target.result);
        };

        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function saveToIndexedDB(data) {
    if (!db) {
        localStorage.setItem('photoboard-state', JSON.stringify(data));
        return;
    }

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ id: 'state', ...data });
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
            localStorage.setItem('photoboard-state', JSON.stringify(data));
            resolve();
        };
    });
}

async function loadFromIndexedDB() {
    if (!db) {
        const saved = localStorage.getItem('photoboard-state');
        return saved ? JSON.parse(saved) : null;
    }

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get('state');

        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result);
            } else {
                // Try localStorage for migration
                const saved = localStorage.getItem('photoboard-state');
                if (saved) {
                    resolve(JSON.parse(saved));
                } else {
                    resolve(null);
                }
            }
        };

        request.onerror = () => {
            const saved = localStorage.getItem('photoboard-state');
            resolve(saved ? JSON.parse(saved) : null);
        };
    });
}

// ============ DOM Elements ============
const board = document.getElementById('board');
const areaContainer = document.getElementById('area-container');
const fileInput = document.getElementById('file-input');
const statusText = document.getElementById('status-text');
const fullscreenModal = document.getElementById('fullscreen-modal');
const fullscreenImg = document.getElementById('fullscreen-img');
const areaCountInput = document.getElementById('area-count');

// ============ Mode Switching ============
function setMode(mode) {
    currentMode = mode;

    document.getElementById('btn-user').classList.toggle('active', mode === 'user');
    document.getElementById('btn-admin').classList.toggle('active', mode === 'admin');

    // Show/hide admin controls
    const adminControls = document.getElementById('admin-controls');
    if (adminControls) {
        adminControls.style.display = mode === 'admin' ? 'flex' : 'none';
    }

    updateStatus();
}

function updateStatus() {
    if (currentMode === 'admin') {
        statusText.innerText = "Set area count and click 'Create Areas'. Double-click area labels to rename.";
    } else {
        if (areas.length === 0) {
            statusText.innerText = "No areas yet. Ask admin to create areas first.";
        } else {
            statusText.innerText = "Click on your designated area to upload a photo or video.";
        }
    }
}

// ============ Area Management ============
function createAreas(count) {
    // Clear existing areas
    areaContainer.innerHTML = '';
    areas = [];

    // Set grid class based on count
    areaContainer.className = `grid-${Math.min(count, 9)}`;

    for (let i = 0; i < count; i++) {
        const area = createAreaElement(i + 1, `Area ${i + 1}`);
        areaContainer.appendChild(area);
        areas.push({
            id: i + 1,
            name: `Area ${i + 1}`,
            element: area,
            mediaSrc: null,
            mediaType: null
        });
    }

    updateStatus();
    saveState();
}

function createAreaElement(id, name) {
    const area = document.createElement('div');
    area.className = 'area';
    area.dataset.id = id;

    // Label
    const label = document.createElement('div');
    label.className = 'area-label';
    label.textContent = name;

    // Double-click to edit in admin mode
    label.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (currentMode === 'admin') {
            enableLabelEdit(label, id);
        }
    });

    // Placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'area-placeholder';
    placeholder.innerHTML = `
        <div class="area-placeholder-icon">📷🎬</div>
        <div class="area-placeholder-text">Click to upload</div>
    `;

    area.appendChild(label);
    area.appendChild(placeholder);

    // Click handler
    area.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return; // Don't trigger on label input
        handleAreaClick(id);
    });

    // Drag & Drop handlers
    area.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (currentMode === 'user') {
            area.classList.add('drag-over');
        }
    });

    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (currentMode === 'user') {
            area.classList.add('drag-over');
        }
    });

    area.addEventListener('dragleave', (e) => {
        e.preventDefault();
        area.classList.remove('drag-over');
    });

    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('drag-over');
        if (currentMode === 'user') {
            handleDrop(id, e);
        }
    });

    return area;
}

function enableLabelEdit(labelElement, areaId) {
    const currentName = labelElement.textContent;
    labelElement.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.addEventListener('blur', () => finishLabelEdit(labelElement, input, areaId));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        }
    });

    labelElement.appendChild(input);
    input.focus();
    input.select();
}

function finishLabelEdit(labelElement, input, areaId) {
    const newName = input.value.trim() || `Area ${areaId}`;
    labelElement.textContent = newName;

    // Update state
    const areaData = areas.find(a => a.id === areaId);
    if (areaData) {
        areaData.name = newName;
    }

    saveState();
}

function handleAreaClick(areaId) {
    if (currentMode === 'user') {
        activeArea = areaId;
        fileInput.click();
    } else {
        // In admin mode, clicking does nothing (use double-click to rename)
    }
}

function setAreaMedia(areaId, mediaSrc, mediaType) {
    const areaData = areas.find(a => a.id === areaId);
    if (!areaData) return;

    const areaElement = areaData.element;
    areaData.mediaSrc = mediaSrc;
    areaData.mediaType = mediaType;

    // Remove placeholder if exists
    const placeholder = areaElement.querySelector('.area-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    // Remove existing media if any
    const existingImg = areaElement.querySelector('img');
    const existingVideo = areaElement.querySelector('video');
    if (existingImg) existingImg.remove();
    if (existingVideo) existingVideo.remove();

    // Add new media
    let mediaElement;
    if (mediaType === 'video') {
        mediaElement = document.createElement('video');
        mediaElement.src = mediaSrc;
        mediaElement.muted = true;
        mediaElement.loop = true;
        mediaElement.autoplay = true;
        mediaElement.playsInline = true;
        mediaElement.addEventListener('click', (e) => {
            e.stopPropagation();
            openFullscreen(mediaSrc, 'video');
        });
    } else {
        mediaElement = document.createElement('img');
        mediaElement.src = mediaSrc;
        mediaElement.addEventListener('click', (e) => {
            e.stopPropagation();
            openFullscreen(mediaSrc, 'image');
        });
    }

    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'area-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete media';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAreaMedia(areaId);
    });

    areaElement.appendChild(mediaElement);
    areaElement.appendChild(deleteBtn);
    areaElement.classList.add('has-image');

    saveState();
}

function resetAreas() {
    if (confirm('Are you sure you want to reset all areas? This will remove all media.')) {
        areaContainer.innerHTML = '';
        areas = [];

        // Show empty state
        areaContainer.innerHTML = `
            <div id="empty-state">
                <h2>No Areas Created</h2>
                <p>Switch to Admin Mode to create areas.</p>
            </div>
        `;
        areaContainer.className = '';

        localStorage.removeItem('photoboard-state');
        updateStatus();
    }
}

function deleteAreaMedia(areaId) {
    if (!confirm('Delete this media?')) return;

    const areaData = areas.find(a => a.id === areaId);
    if (!areaData) return;

    const areaElement = areaData.element;
    areaData.mediaSrc = null;
    areaData.mediaType = null;

    // Remove media and delete button
    const img = areaElement.querySelector('img');
    const video = areaElement.querySelector('video');
    const deleteBtn = areaElement.querySelector('.area-delete-btn');
    if (img) img.remove();
    if (video) video.remove();
    if (deleteBtn) deleteBtn.remove();

    // Restore placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'area-placeholder';
    placeholder.innerHTML = `
        <div class="area-placeholder-icon">📷🎬</div>
        <div class="area-placeholder-text">Click to upload</div>
    `;
    areaElement.appendChild(placeholder);
    areaElement.classList.remove('has-image');

    saveState();
}

// ============ Fullscreen ============
const fullscreenVideo = document.getElementById('fullscreen-video');

function openFullscreen(src, type = 'image') {
    if (type === 'video') {
        fullscreenImg.style.display = 'none';
        fullscreenVideo.style.display = 'block';
        fullscreenVideo.src = src;
        fullscreenVideo.play();
    } else {
        fullscreenVideo.style.display = 'none';
        fullscreenImg.style.display = 'block';
        fullscreenImg.src = src;
    }
    fullscreenModal.classList.add('active');
}

function closeFullscreen() {
    fullscreenModal.classList.remove('active');
    setTimeout(() => {
        fullscreenImg.src = '';
        fullscreenVideo.src = '';
        fullscreenVideo.pause();
    }, 300);
}

// ============ Download All ============
async function downloadAllMedia() {
    const mediaWithData = areas.filter(a => a.mediaSrc);

    if (mediaWithData.length === 0) {
        alert('No media to download. Upload some photos or videos first!');
        return;
    }

    const zip = new JSZip();

    mediaWithData.forEach((areaData, index) => {
        // Extract base64 data and file extension
        const base64Data = areaData.mediaSrc.split(',')[1];
        const mimeType = areaData.mediaSrc.split(';')[0].split(':')[1];
        let extension = mimeType.split('/')[1] || 'png';
        // Handle special video extensions
        if (extension === 'quicktime') extension = 'mov';
        if (extension === 'x-matroska') extension = 'mkv';

        // Create safe filename from area name
        const safeName = areaData.name.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${safeName}.${extension}`;

        zip.file(filename, base64Data, { base64: true });
    });

    // Generate and download ZIP
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);

    const a = document.createElement('a');
    a.href = url;
    a.download = `PhotoBoard_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============ File Upload ============
fileInput.addEventListener('change', (e) => {
    if (fileInput.files && fileInput.files[0] && activeArea !== null) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

        reader.onload = function (e) {
            setAreaMedia(activeArea, e.target.result, mediaType);
            activeArea = null;
            fileInput.value = '';
        };

        reader.readAsDataURL(file);
    }
});

function handleDrop(areaId, e) {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        const file = files[0];

        // Validate file type (image or video)
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert('Please drop an image or video file.');
            return;
        }

        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
        const reader = new FileReader();
        reader.onload = function (e) {
            setAreaMedia(areaId, e.target.result, mediaType);
        };
        reader.readAsDataURL(file);
    }
}

// ============ Persistence ============
function saveState() {
    const state = {
        areas: areas.map(a => ({
            id: a.id,
            name: a.name,
            mediaSrc: a.mediaSrc,
            mediaType: a.mediaType
        }))
    };
    saveToIndexedDB(state);
}

async function loadState() {
    const state = await loadFromIndexedDB();

    if (!state || !state.areas || state.areas.length === 0) {
        // Show empty state
        areaContainer.innerHTML = `
            <div id="empty-state">
                <h2>No Areas Created</h2>
                <p>Switch to Admin Mode to create areas.</p>
            </div>
        `;
        return;
    }

    try {
        // Recreate areas
        areaContainer.innerHTML = '';
        areaContainer.className = `grid-${Math.min(state.areas.length, 9)}`;

        state.areas.forEach(areaData => {
            const area = createAreaElement(areaData.id, areaData.name);
            areaContainer.appendChild(area);

            // Handle migration from old imageSrc to new mediaSrc
            const mediaSrc = areaData.mediaSrc || areaData.imageSrc;
            const mediaType = areaData.mediaType || (mediaSrc && mediaSrc.startsWith('data:video') ? 'video' : 'image');

            areas.push({
                id: areaData.id,
                name: areaData.name,
                element: area,
                mediaSrc: mediaSrc,
                mediaType: mediaType
            });

            // Restore media if any
            if (mediaSrc) {
                // Small delay to let DOM settle
                setTimeout(() => {
                    setAreaMedia(areaData.id, mediaSrc, mediaType);
                }, 50);
            }
        });

        // Update area count input
        if (areaCountInput) {
            areaCountInput.value = state.areas.length;
        }

        // Migrate from localStorage to IndexedDB (one-time)
        if (db && localStorage.getItem('photoboard-state')) {
            await saveToIndexedDB(state);
            localStorage.removeItem('photoboard-state');
            console.log('Migrated data from localStorage to IndexedDB');
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
}

// ============ Initialize ============
async function init() {
    // Initialize IndexedDB
    db = await openDatabase();

    setMode('user');
    await loadState();
    updateStatus();

    // Close fullscreen on click (only on background, not on video controls)
    fullscreenModal.addEventListener('click', (e) => {
        // Only close if clicking directly on the modal background
        if (e.target === fullscreenModal || e.target === fullscreenImg) {
            closeFullscreen();
        }
    });

    // Prevent video clicks from closing modal
    fullscreenVideo.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Run init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
