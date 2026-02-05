// PhotoBoard - Real-time Photo & Video Sharing
// Using Firebase Firestore (sync) + Cloudinary (media storage)

// ============ Firebase Configuration ============
const firebaseConfig = {
    apiKey: "AIzaSyDI63JhQvBXsWsC_fjGU0F16ufEZqBPXFM",
    authDomain: "photoboard-c279b.firebaseapp.com",
    projectId: "photoboard-c279b",
    storageBucket: "photoboard-c279b.firebasestorage.app",
    messagingSenderId: "623858429917",
    appId: "1:623858429917:web:ac7104ed61b135e4019034"
};

// ============ Cloudinary Configuration ============
const CLOUDINARY_CLOUD_NAME = 'dwq1io4it';
const CLOUDINARY_UPLOAD_PRESET = 'onkcbsyc';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============ State ============
let currentMode = 'user';
let areas = [];
let activeArea = null;
let unsubscribe = null;

// ============ DOM Elements ============
const board = document.getElementById('board');
const areaContainer = document.getElementById('area-container');
const fileInput = document.getElementById('file-input');
const statusText = document.getElementById('status-text');
const fullscreenModal = document.getElementById('fullscreen-modal');
const fullscreenImg = document.getElementById('fullscreen-img');
const fullscreenVideo = document.getElementById('fullscreen-video');
const areaCountInput = document.getElementById('area-count');
const syncStatus = document.getElementById('sync-status');
const uploadModal = document.getElementById('upload-modal');
const uploadStatus = document.getElementById('upload-status');
const uploadProgress = document.getElementById('upload-progress');

// ============ Sync Status ============
function setSyncStatus(status, message) {
    syncStatus.className = 'sync-indicator ' + status;
    syncStatus.textContent = message;
}

// ============ Upload Modal ============
function showUploadModal(message = 'Uploading...') {
    uploadStatus.textContent = message;
    uploadProgress.style.width = '0%';
    uploadModal.classList.add('active');
}

function updateUploadProgress(percent) {
    uploadProgress.style.width = percent + '%';
}

function hideUploadModal() {
    uploadModal.classList.remove('active');
}

// ============ Mode Switching ============
function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-user').classList.toggle('active', mode === 'user');
    document.getElementById('btn-admin').classList.toggle('active', mode === 'admin');

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

// ============ Cloudinary Upload ============
async function uploadToCloudinary(file, areaId) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', 'photoboard');
        formData.append('public_id', `area_${areaId}_${Date.now()}`);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', CLOUDINARY_UPLOAD_URL);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                updateUploadProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                resolve({
                    url: response.secure_url,
                    publicId: response.public_id,
                    resourceType: response.resource_type
                });
            } else {
                reject(new Error('Upload failed'));
            }
        };

        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
    });
}

// ============ Area Management ============
async function createAreas(count) {
    areaContainer.innerHTML = '';
    areas = [];
    areaContainer.className = `grid-${Math.min(count, 9)}`;

    const areasData = [];
    for (let i = 0; i < count; i++) {
        areasData.push({
            id: i + 1,
            name: `Area ${i + 1}`,
            mediaUrl: null,
            mediaType: null,
            publicId: null
        });
    }

    try {
        await db.collection('photoboard').doc('state').set({
            areas: areasData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        setSyncStatus('connected', '✅ Synced');
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        setSyncStatus('error', '❌ Sync failed');
    }
}

function createAreaElement(id, name) {
    const area = document.createElement('div');
    area.className = 'area';
    area.dataset.id = id;

    const label = document.createElement('div');
    label.className = 'area-label';
    label.textContent = name;

    label.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (currentMode === 'admin') {
            enableLabelEdit(label, id);
        }
    });

    const placeholder = document.createElement('div');
    placeholder.className = 'area-placeholder';
    placeholder.innerHTML = `
        <div class="area-placeholder-icon">📷🎬</div>
        <div class="area-placeholder-text">Click to upload</div>
    `;

    area.appendChild(label);
    area.appendChild(placeholder);

    area.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        handleAreaClick(id);
    });

    // Drag & Drop
    area.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (currentMode === 'user') area.classList.add('drag-over');
    });

    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (currentMode === 'user') area.classList.add('drag-over');
    });

    area.addEventListener('dragleave', (e) => {
        e.preventDefault();
        area.classList.remove('drag-over');
    });

    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('drag-over');
        if (currentMode === 'user') handleDrop(id, e);
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
        if (e.key === 'Enter') input.blur();
    });

    labelElement.appendChild(input);
    input.focus();
    input.select();
}

async function finishLabelEdit(labelElement, input, areaId) {
    const newName = input.value.trim() || `Area ${areaId}`;
    labelElement.textContent = newName;

    const areaData = areas.find(a => a.id === areaId);
    if (areaData) areaData.name = newName;

    await saveToFirebase();
}

function handleAreaClick(areaId) {
    if (currentMode === 'user') {
        activeArea = areaId;
        fileInput.click();
    }
}

function renderAreaMedia(areaId, mediaUrl, mediaType) {
    const areaData = areas.find(a => a.id === areaId);
    if (!areaData || !areaData.element) return;

    const areaElement = areaData.element;

    // Remove existing content
    const placeholder = areaElement.querySelector('.area-placeholder');
    const existingImg = areaElement.querySelector('img');
    const existingVideo = areaElement.querySelector('video');
    const existingDeleteBtn = areaElement.querySelector('.area-delete-btn');

    if (placeholder) placeholder.remove();
    if (existingImg) existingImg.remove();
    if (existingVideo) existingVideo.remove();
    if (existingDeleteBtn) existingDeleteBtn.remove();

    if (!mediaUrl) {
        const newPlaceholder = document.createElement('div');
        newPlaceholder.className = 'area-placeholder';
        newPlaceholder.innerHTML = `
            <div class="area-placeholder-icon">📷🎬</div>
            <div class="area-placeholder-text">Click to upload</div>
        `;
        areaElement.appendChild(newPlaceholder);
        areaElement.classList.remove('has-image');
        return;
    }

    let mediaElement;
    if (mediaType === 'video') {
        mediaElement = document.createElement('video');
        mediaElement.src = mediaUrl;
        mediaElement.muted = true;
        mediaElement.loop = true;
        mediaElement.autoplay = true;
        mediaElement.playsInline = true;
        mediaElement.addEventListener('click', (e) => {
            e.stopPropagation();
            openFullscreen(mediaUrl, 'video');
        });
    } else {
        mediaElement = document.createElement('img');
        mediaElement.src = mediaUrl;
        mediaElement.addEventListener('click', (e) => {
            e.stopPropagation();
            openFullscreen(mediaUrl, 'image');
        });
    }

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
}

async function resetAreas() {
    if (confirm('Are you sure you want to reset all areas? This will remove all media.')) {
        await db.collection('photoboard').doc('state').delete();

        areaContainer.innerHTML = `
            <div id="empty-state">
                <h2>No Areas Created</h2>
                <p>Switch to Admin Mode to create areas.</p>
            </div>
        `;
        areaContainer.className = '';
        areas = [];
        updateStatus();
    }
}

async function deleteAreaMedia(areaId) {
    if (!confirm('Delete this media?')) return;

    const areaData = areas.find(a => a.id === areaId);
    if (!areaData) return;

    showUploadModal('Deleting...');

    try {
        areaData.mediaUrl = null;
        areaData.mediaType = null;
        areaData.publicId = null;

        await saveToFirebase();
        hideUploadModal();
    } catch (error) {
        console.error('Error deleting:', error);
        hideUploadModal();
        alert('Failed to delete. Please try again.');
    }
}

// ============ Fullscreen ============
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
    const mediaWithData = areas.filter(a => a.mediaUrl);

    if (mediaWithData.length === 0) {
        alert('No media to download. Upload some photos or videos first!');
        return;
    }

    showUploadModal('Preparing download...');

    try {
        const zip = new JSZip();

        for (let i = 0; i < mediaWithData.length; i++) {
            const areaData = mediaWithData[i];
            updateUploadProgress((i / mediaWithData.length) * 100);
            uploadStatus.textContent = `Downloading ${i + 1}/${mediaWithData.length}...`;

            const response = await fetch(areaData.mediaUrl);
            const blob = await response.blob();

            const mimeType = blob.type;
            let extension = mimeType.split('/')[1] || 'bin';
            if (extension === 'quicktime') extension = 'mov';

            const safeName = areaData.name.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `${safeName}.${extension}`;

            zip.file(filename, blob);
        }

        updateUploadProgress(100);
        uploadStatus.textContent = 'Creating ZIP...';

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);

        const a = document.createElement('a');
        a.href = url;
        a.download = `PhotoBoard_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        hideUploadModal();
    } catch (error) {
        console.error('Error downloading:', error);
        hideUploadModal();
        alert('Failed to download. Please try again.');
    }
}

// ============ File Upload ============
fileInput.addEventListener('change', async (e) => {
    if (fileInput.files && fileInput.files[0] && activeArea !== null) {
        const file = fileInput.files[0];
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

        showUploadModal('Uploading to cloud...');

        try {
            const result = await uploadToCloudinary(file, activeArea);

            const areaData = areas.find(a => a.id === activeArea);
            if (areaData) {
                areaData.mediaUrl = result.url;
                areaData.mediaType = mediaType;
                areaData.publicId = result.publicId;
            }

            await saveToFirebase();

            activeArea = null;
            fileInput.value = '';
            hideUploadModal();
        } catch (error) {
            console.error('Upload error:', error);
            hideUploadModal();
            alert('Upload failed. Please try again.');
        }
    }
});

function handleDrop(areaId, e) {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        const file = files[0];

        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert('Please drop an image or video file.');
            return;
        }

        activeArea = areaId;
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
    }
}

// ============ Firebase Sync ============
async function saveToFirebase() {
    try {
        const areasData = areas.map(a => ({
            id: a.id,
            name: a.name,
            mediaUrl: a.mediaUrl || null,
            mediaType: a.mediaType || null,
            publicId: a.publicId || null
        }));

        await db.collection('photoboard').doc('state').set({
            areas: areasData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setSyncStatus('connected', '✅ Synced');
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        setSyncStatus('error', '❌ Sync failed');
    }
}

function subscribeToUpdates() {
    unsubscribe = db.collection('photoboard').doc('state')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                renderAreas(data.areas);
                setSyncStatus('connected', '✅ Live');
            } else {
                areaContainer.innerHTML = `
                    <div id="empty-state">
                        <h2>No Areas Created</h2>
                        <p>Switch to Admin Mode to create areas.</p>
                    </div>
                `;
                areaContainer.className = '';
                areas = [];
            }
            updateStatus();
        }, (error) => {
            console.error('Firestore error:', error);
            setSyncStatus('error', '❌ Connection lost');
        });
}

function renderAreas(areasData) {
    if (!areasData || areasData.length === 0) {
        areaContainer.innerHTML = `
            <div id="empty-state">
                <h2>No Areas Created</h2>
                <p>Switch to Admin Mode to create areas.</p>
            </div>
        `;
        areaContainer.className = '';
        areas = [];
        return;
    }

    const needsRebuild = areas.length !== areasData.length;

    if (needsRebuild) {
        areaContainer.innerHTML = '';
        areaContainer.className = `grid-${Math.min(areasData.length, 9)}`;
        areas = [];

        areasData.forEach(areaData => {
            const area = createAreaElement(areaData.id, areaData.name);
            areaContainer.appendChild(area);

            areas.push({
                id: areaData.id,
                name: areaData.name,
                element: area,
                mediaUrl: areaData.mediaUrl,
                mediaType: areaData.mediaType,
                publicId: areaData.publicId
            });

            if (areaData.mediaUrl) {
                renderAreaMedia(areaData.id, areaData.mediaUrl, areaData.mediaType);
            }
        });
    } else {
        areasData.forEach(areaData => {
            const existing = areas.find(a => a.id === areaData.id);
            if (existing) {
                if (existing.name !== areaData.name) {
                    existing.name = areaData.name;
                    const label = existing.element.querySelector('.area-label');
                    if (label) label.textContent = areaData.name;
                }

                if (existing.mediaUrl !== areaData.mediaUrl) {
                    existing.mediaUrl = areaData.mediaUrl;
                    existing.mediaType = areaData.mediaType;
                    existing.publicId = areaData.publicId;
                    renderAreaMedia(areaData.id, areaData.mediaUrl, areaData.mediaType);
                }
            }
        });
    }

    if (areaCountInput) {
        areaCountInput.value = areasData.length;
    }
}

// ============ Initialize ============
async function init() {
    setSyncStatus('', '🔄 Connecting...');
    setMode('user');
    subscribeToUpdates();

    fullscreenModal.addEventListener('click', (e) => {
        if (e.target === fullscreenModal || e.target === fullscreenImg) {
            closeFullscreen();
        }
    });

    fullscreenVideo.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
