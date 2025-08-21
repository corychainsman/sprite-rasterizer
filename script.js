//==============================================================================
// GLOBAL STATE AND CONFIGURATION
//==============================================================================

// Application state
let sprites = [];
let webcamStream = null;
let rasterizer = null;
let animationId = null;
let lastFrameTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;

// Grid configuration - calculated from first sprite dimensions
let baseGridWidth = 256;
let baseGridHeight = 256;

// Sprite collections by type
let imageSprites = [];
let textSprites = [];

//==============================================================================
// DOM ELEMENT REFERENCES
//==============================================================================

// Core application elements
const spriteGallery = document.getElementById('sprite-gallery');
const spriteUpload = document.getElementById('sprite-upload');
const webcam = document.getElementById('webcam');
const staticImage = document.getElementById('static-image');
const outputCanvas = document.getElementById('output-canvas');
const dropZone = document.getElementById('drop-zone');
const sourceStatus = document.getElementById('source-status');
const resetSource = document.getElementById('reset-source');
const showVideoOverlay = document.getElementById('show-video-overlay');
const canvasBgColor = document.getElementById('canvas-bg-color');
const textColor = document.getElementById('text-color');
const spritesMessage = document.getElementById('sprites-message');
const webcamSelect = document.getElementById('webcam-select');

// Control panel elements
const scale = document.getElementById('scale');
const scaleValue = document.getElementById('scale-value');
const gridDisplay = document.getElementById('grid-display');
const threshold = document.getElementById('threshold');
const thresholdValue = document.getElementById('threshold-value');
const matchingRadios = document.querySelectorAll('input[name="matching"]');
const fpsCounter = document.getElementById('fps-counter');
const spriteCount = document.getElementById('sprite-count');
const statusText = document.getElementById('status-text');

//==============================================================================
// WEBCAM MIRRORING UTILITIES
//==============================================================================

// Function to mirror any video element
function mirrorVideoElement(videoElement) {
    if (videoElement && videoElement.tagName === 'VIDEO') {
        videoElement.style.transform = 'scaleX(-1)';
    }
}

// Function to mirror all webcam video elements
function mirrorAllWebcamElements() {
    // Mirror main webcam
    mirrorVideoElement(webcam);
    
    // Mirror capture modal video if it exists
    const captureVideo = document.getElementById('capture-video');
    if (captureVideo) {
        mirrorVideoElement(captureVideo);
    }
}

// Function to create a mirrored canvas context for webcam operations
function createMirroredCanvasContext(sourceVideo, targetCanvas) {
    const ctx = targetCanvas.getContext('2d');
    
    // Save the current context state
    ctx.save();
    
    // Apply mirroring transformation
    ctx.scale(-1, 1);
    ctx.translate(-targetCanvas.width, 0);
    
    return ctx;
}

// Function to restore canvas context after mirrored drawing
function restoreCanvasContext(ctx) {
    ctx.restore();
}

// Function to set up observer for automatically mirroring new video elements
function setupVideoMirroringObserver() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    // Check if the added node is a video element
                    if (node.tagName === 'VIDEO') {
                        mirrorVideoElement(node);
                    }
                    // Check if the added node has video children
                    if (node.querySelectorAll) {
                        const videos = node.querySelectorAll('video');
                        videos.forEach(video => mirrorVideoElement(video));
                    }
                });
            }
        });
    });
    
    // Start observing the document body for changes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

//==============================================================================
// INITIALIZATION AND COMPATIBILITY
//==============================================================================
function checkBrowserCompatibility() {
    const issues = [];
    
    // Check WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
        issues.push('WebGL not supported - modern browser required');
    }
    
    // Check getUserMedia support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        issues.push('Camera access not supported');
    }
    
    // Check FileReader support
    if (!window.FileReader) {
        issues.push('File upload not supported');
    }
    
    // Check ES6 support (basic check)
    try {
        eval('const test = () => {}');
    } catch (e) {
        issues.push('Modern JavaScript not supported - please update browser');
    }
    
    if (issues.length > 0) {
        const message = 'Browser compatibility issues detected:\n• ' + issues.join('\n• ');
        showError(message);
        statusText.textContent = 'Browser compatibility issues detected';
        return false;
    }
    
    return true;
}

// Initialize the application
async function init() {
    statusText.textContent = 'Initializing...';
    
    // Check browser compatibility first
    if (!checkBrowserCompatibility()) {
        return;
    }
    
    try {
        // Initialize core functionality first
        initEventListeners();
        initRasterizer();
        updateSpriteGallery();
        updateGridDisplay();
        
        // Initialize text sprites from default value
        const textInput = document.getElementById('text-sprites');
        if (textInput.value) {
            handleTextSpritesInput({ target: textInput });
        }
        
        // Try webcam initialization separately - don't let it block core functionality
        try {
            await initWebcam();
            // Ensure all webcam elements are mirrored after initialization
            mirrorAllWebcamElements();
            statusText.textContent = 'Ready - Add at least 2 characters or sprite images to begin';
            // showSuccess('Application initialized successfully');
        } catch (webcamError) {
            console.warn('Webcam initialization failed:', webcamError);
            statusText.textContent = 'Ready - Add at least 2 characters or sprite images to begin (webcam unavailable)';
            showWarning('Webcam unavailable - you can still upload images and use static images');
        }
        
    } catch (error) {
        console.error('Core initialization failed:', error);
        showError('Failed to initialize core functionality: ' + error.message);
        statusText.textContent = 'Initialization failed';
    }
}

// Webcam initialization
async function initWebcam() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        updateWebcamSelect(videoDevices);
        
        if (videoDevices.length > 0) {
            await startWebcam();
        } else {
            throw new Error('No camera detected');
        }
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            throw new Error('Camera permission denied - Click here to learn how to enable');
        } else if (error.name === 'NotFoundError') {
            throw new Error('No camera detected');
        } else if (error.name === 'NotReadableError') {
            throw new Error('Camera in use by another application');
        } else {
            throw error;
        }
    }
}

function updateWebcamSelect(devices) {
    webcamSelect.innerHTML = '';
    devices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        webcamSelect.appendChild(option);
    });
}

async function startWebcam(deviceId) {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined
        }
    };

    webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
    webcam.srcObject = webcamStream;
    
    // Also set up capture video if it exists and modal is open
    const captureVideo = document.getElementById('capture-video');
    const captureModal = document.getElementById('capture-modal');
    if (captureVideo && captureModal && captureModal.classList.contains('active')) {
        captureVideo.srcObject = webcamStream;
    }
    
    // Mirror all webcam elements
    mirrorAllWebcamElements();
}

//==============================================================================
// EVENT HANDLING AND USER INTERACTIONS
//==============================================================================
function initEventListeners() {
    // Sprite upload
    spriteUpload.addEventListener('change', handleSpriteUpload);
    
    // Webcam controls
    webcamSelect.addEventListener('change', async (e) => {
        await startWebcam(e.target.value);
    });
    
    
    // Scale control
    scale.addEventListener('input', updateScale);
    
    // Threshold control
    threshold.addEventListener('input', updateThreshold);
    
    // Matching algorithm
    matchingRadios.forEach(radio => {
        radio.addEventListener('change', updateMatchingAlgorithm);
    });
    
    // Source reset
    resetSource.addEventListener('click', resetToWebcam);
    
    // Video overlay toggle
    // showVideoOverlay.addEventListener('change', toggleVideoOverlay);
    
    // Canvas background color
    canvasBgColor.addEventListener('change', updateCanvasBackground);
    canvasBgColor.addEventListener('input', updateCanvasBackground);
    
    // Text color
    textColor.addEventListener('change', updateTextColor);
    textColor.addEventListener('input', updateTextColor);
    
    // Drop zone for static images
    setupDropZone();
    
    // Canvas context menu (right-click save)
    outputCanvas.addEventListener('contextmenu', (e) => {
        // Allow default context menu for save functionality
    });
    
    // Sprite capture
    document.getElementById('capture-sprite').addEventListener('click', handleSpriteCapture);
    setupCaptureModal();
    
    // Clear all sprites
    document.getElementById('clear-all-sprites').addEventListener('click', clearAllSprites);
    
    // Ensure all webcam elements are mirrored
    mirrorAllWebcamElements();
    
    // Set up observer to automatically mirror any new video elements
    setupVideoMirroringObserver();
    
    // Text sprites input
    document.getElementById('text-sprites').addEventListener('input', handleTextSpritesInput);
    
    // Emoji picker
    setupEmojiPicker();
}

function setupDropZone() {
    const dropZonePreview = document.getElementById('drop-zone-preview');
    const dropZoneImage = document.getElementById('drop-zone-image');
    const dropZoneRemove = document.getElementById('drop-zone-remove');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        document.addEventListener(eventName, () => dropZone.classList.add('active'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, () => dropZone.classList.remove('active'), false);
    });
    
    document.addEventListener('drop', handleImageDrop, false);
    
    // Click to browse functionality
    dropZone.addEventListener('click', (e) => {
        if (!e.target.closest('.drop-zone-remove')) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    handleImageFile(file);
                }
            };
            fileInput.click();
        }
    });
    
    // Remove button functionality
    dropZoneRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        clearDropZonePreview();
        resetToWebcam();
    });
    
    function showDropZonePreview(imageUrl) {
        dropZoneImage.src = imageUrl;
        dropZonePreview.classList.add('show');
    }
    
    function clearDropZonePreview() {
        dropZoneImage.src = '';
        dropZonePreview.classList.remove('show');
    }
    
    // Store functions on the dropZone element for external access
    dropZone.showPreview = showDropZonePreview;
    dropZone.clearPreview = clearDropZonePreview;
}

async function handleImageDrop(e) {
    const files = [...e.dataTransfer.files];
    const imageFile = files.find(file => file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.heic'));
    
    if (imageFile) {
        await handleImageFile(imageFile);
    }
}

async function handleImageFile(file) {
    try {
        await loadStaticImage(file);
    } catch (error) {
        showError('Failed to load image: ' + error.message);
    }
}

async function loadStaticImage(file) {
    try {
        const convertedFile = await convertHEIC(file);
        const imageUrl = URL.createObjectURL(convertedFile);
        
        staticImage.src = imageUrl;
        staticImage.onload = () => {
            webcam.classList.add('hidden');
            // staticImage.classList.remove('hidden');
            // sourceStatus.textContent = '📷 Static Image';
            resetSource.classList.remove('hidden');
            
            // Show thumbnail preview in drop zone
            if (dropZone.showPreview) {
                dropZone.showPreview(imageUrl);
            }
            
            URL.revokeObjectURL(imageUrl);
        };
    } catch (error) {
        showError('Failed to load image: ' + error.message);
    }
}

function resetToWebcam() {
    // staticImage.classList.toggle('hidden');
    webcam.classList.toggle('hidden');
    // sourceStatus.textContent = '🎥 Webcam';
    resetSource.classList.toggle('hidden');
    staticImage.src = '';
    
    // Clear thumbnail preview in drop zone
    if (dropZone.clearPreview) {
        dropZone.clearPreview();
    }
    
    // Ensure webcam is mirrored when resetting
    mirrorAllWebcamElements();
}


function updateCanvasBackground(e) {
    const color = e.target.value;
    outputCanvas.style.backgroundColor = color;
}

function updateTextColor() {
    // Regenerate text sprites with new color
    const textInput = document.getElementById('text-sprites');
    if (textInput.value.trim()) {
        handleTextSpritesInput({ target: textInput });
    }
}

//==============================================================================
// EMOJI PICKER FUNCTIONALITY
//==============================================================================
function setupEmojiPicker() {
    const emojiPickerBtn = document.getElementById('emoji-picker-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    const emojiGrid = document.getElementById('emoji-grid');
    const textInput = document.getElementById('text-sprites');
    
    const emojiData = {
        smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳'],
        nature: ['🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌛', '🌜', '⭐', '🌟', '💫', '✨', '☄️', '🌍', '🌎', '🌏', '🌈', '🌿', '🍀', '🌱', '🌳', '🌲', '🌴', '🌵', '🌷', '🌸', '🌹', '🌺'],
        food: ['🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍞', '🥖', '🥨', '🧀', '🥯', '🥐', '🍰', '🧁', '🍪', '🍫', '🍬'],
        activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌'],
        travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🚁', '✈️', '🛩️', '🚀', '🛸', '🚉', '🚊', '🚝', '🚞', '🚋', '🚃', '🚂'],
        objects: ['📱', '💻', '🖥️', '⌨️', '🖱️', '🖨️', '📞', '☎️', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '⏰', '⏲️', '⏱️', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '📷', '📸', '📹', '📼', '💾', '💿', '📀'],
        symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎']
    };
    
    let isPickerOpen = false;
    
    // Toggle emoji picker
    emojiPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isPickerOpen) {
            closeEmojiPicker();
        } else {
            openEmojiPicker();
        }
    });
    
    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
        if (isPickerOpen && !emojiPicker.contains(e.target) && e.target !== emojiPickerBtn) {
            closeEmojiPicker();
        }
    });
    
    
    function openEmojiPicker() {
        emojiPicker.classList.remove('hidden');
        isPickerOpen = true;
        // Show all emojis in one scrollable grid
        showAllEmojis();
    }
    
    function closeEmojiPicker() {
        emojiPicker.classList.add('hidden');
        isPickerOpen = false;
    }
    
    function showAllEmojis() {
        emojiGrid.innerHTML = '';
        
        // Define category display names
        const categoryNames = {
            smileys: 'Smileys & People',
            nature: 'Nature & Weather',
            food: 'Food & Drink',
            activities: 'Activities & Sports',
            travel: 'Travel & Places',
            objects: 'Objects & Technology',
            symbols: 'Symbols & Hearts'
        };
        
        // Add all emojis with category headers
        Object.keys(emojiData).forEach(categoryKey => {
            // Add category header
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'emoji-category-header';
            categoryHeader.textContent = categoryNames[categoryKey];
            emojiGrid.appendChild(categoryHeader);
            
            // Add emojis for this category
            emojiData[categoryKey].forEach(emoji => {
                const emojiItem = document.createElement('div');
                emojiItem.className = 'emoji-item';
                emojiItem.textContent = emoji;
                emojiItem.addEventListener('click', () => {
                    // Add emoji to text input
                    textInput.value += emoji;
                    // Trigger input event to update sprites
                    textInput.dispatchEvent(new Event('input'));
                    // Keep picker open - don't auto-close
                });
                emojiGrid.appendChild(emojiItem);
            });
        });
    }
}

//==============================================================================
// IMAGE PROCESSING AND FILE HANDLING
//==============================================================================

// HEIC conversion support
async function convertHEIC(file) {
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        // Convert HEIC to PNG using canvas-based conversion
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            return new Promise((resolve, reject) => {
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to convert HEIC'));
                        }
                    }, 'image/png');
                };
                
                img.onerror = () => reject(new Error('Invalid HEIC file'));
                img.src = URL.createObjectURL(file);
            });
        } catch (error) {
            throw new Error('HEIC conversion failed. Please use PNG, JPG, or WebP.');
        }
    }
    return file;
}

//==============================================================================
// SPRITE MANAGEMENT
//==============================================================================
async function handleSpriteUpload(e) {
    const files = [...e.target.files];
    
    for (const file of files) {
        if (sprites.length >= 32) {
            showError('Maximum 32 sprites allowed');
            break;
        }
        
        if (file.size > 50 * 1024 * 1024) {
            showError(`File ${file.name} is too large (max 50MB)`);
            continue;
        }
        
        try {
            await addSprite(file);
        } catch (error) {
            showError(`Failed to load ${file.name}: ${error.message}`);
        }
    }
    
    e.target.value = '';
}

async function addSprite(file) {
    const convertedFile = await convertHEIC(file);
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const sprite = {
                id: Date.now() + Math.random(),
                image: img,
                name: file.name,
                width: img.width,
                height: img.height
            };
            
            // If this is the first sprite overall, set dimensions for all sprites
            const allSprites = getAllSprites();
            if (allSprites.length === 0) {
                sprite.normalizedWidth = img.width;
                sprite.normalizedHeight = img.height;
                updateDefaultGridSize();
                showSuccess(`First sprite dimensions: ${img.width}x${img.height}`);
            } else {
                // Normalize to first sprite dimensions
                const firstSprite = allSprites[0];
                sprite.normalizedWidth = firstSprite.normalizedWidth;
                sprite.normalizedHeight = firstSprite.normalizedHeight;
                
                if (img.width !== firstSprite.normalizedWidth || img.height !== firstSprite.normalizedHeight) {
                    showSuccess(`Sprite resized to match first sprite: ${firstSprite.normalizedWidth}x${firstSprite.normalizedHeight}`);
                }
            }
            
            imageSprites.push(sprite);
            updateSpriteGallery();
            updateTotalSpriteCount();
            checkRenderingConditions();
            
            resolve();
        };
        
        img.onerror = () => reject(new Error('Invalid image format'));
        img.src = URL.createObjectURL(convertedFile);
    });
}

function updateDefaultGridSize() {
    // Calculate reasonable grid size based on typical source dimensions (320x240)
    // and sprite size to create a good mosaic effect
    const sourceWidth = 320;
    const sourceHeight = 240;
    
    // Aim for sprites to be roughly 8-16 pixels of the source image each
    // This creates a good balance between detail and mosaic effect
    const targetSpriteSourceSize = 12; // pixels of source per sprite
    
    baseGridWidth = Math.round(sourceWidth / targetSpriteSourceSize);
    baseGridHeight = Math.round(sourceHeight / targetSpriteSourceSize);
    
    // Update display
    updateGridDisplay();
}

function updateSpriteGallery() {
    spriteGallery.innerHTML = '';
    
    // Add existing image sprites only (not text sprites)
    imageSprites.forEach(sprite => {
        const item = document.createElement('div');
        item.className = 'sprite-item';
        item.title = sprite.name;
        
        const img = document.createElement('img');
        img.src = sprite.image.src;
        item.appendChild(img);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'sprite-delete';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            removeImageSprite(sprite.id);
        };
        item.appendChild(deleteBtn);
        
        spriteGallery.appendChild(item);
    });
    
    // Add empty slots up to 32
    for (let i = imageSprites.length; i < Math.min(32, imageSprites.length + 6); i++) {
        const item = document.createElement('div');
        item.className = 'sprite-item empty';
        item.innerHTML = '+';
        item.onclick = () => document.getElementById('sprite-upload').click();
        spriteGallery.appendChild(item);
    }
    
    updateSpritesMessage();
}

function updateSpritesMessage() {
    const totalSprites = getAllSprites();
    // Show error message only when there are fewer than 2 sprites total
    if (totalSprites.length < 2) {
        // spritesMessage.innerHTML = '<div class="error-message">Add at least 2 sprites</div>';
    } else {
        spritesMessage.innerHTML = '';
    }
}

// Create a default test pattern when no webcam/image source is available
function createDefaultTestPattern() {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    
    // Create a colorful gradient test pattern
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(0.25, '#00ff00');
    gradient.addColorStop(0.5, '#0000ff');
    gradient.addColorStop(0.75, '#ffff00');
    gradient.addColorStop(1, '#ff00ff');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add some geometric shapes for better sprite matching
    ctx.fillStyle = '#000000';
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = 10 + Math.random() * 30;
        ctx.fillRect(x, y, size, size);
    }
    
    // Convert to image and set as static source
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        staticImage.src = url;
        staticImage.onload = () => {
            webcam.classList.toggle('hidden');
            // staticImage.classList.toggle('hidden');
            // sourceStatus.textContent = '🎨 Test Pattern';
            resetSource.classList.toggle('hidden');
            URL.revokeObjectURL(url);
        };
    });
}

function removeImageSprite(id) {
    imageSprites = imageSprites.filter(sprite => sprite.id !== id);
    updateSpriteGallery();
    updateTotalSpriteCount();
    checkRenderingConditions();
}


// Helper function to get all sprites combined
function getAllSprites() {
    return [...imageSprites, ...textSprites];
}

// Helper function to update total sprite count display
function updateTotalSpriteCount() {
    const totalSprites = getAllSprites();
    spriteCount.textContent = totalSprites.length;
    sprites = totalSprites; // Keep legacy sprites array updated for compatibility
}

function clearAllSprites() {
    const totalSprites = getAllSprites();
    if (totalSprites.length === 0) {
        showWarning('No sprites to clear');
        return;
    }
    
    const confirmed = confirm(`Clear all ${totalSprites.length} sprites? This cannot be undone.`);
    if (confirmed) {
        imageSprites = [];
        textSprites = [];
        sprites = [];
        updateSpriteGallery();
        updateTotalSpriteCount();
        stopRendering();
        statusText.textContent = 'Add at least 2 characters or sprite images to begin';
        showSuccess('All sprites cleared');
        
        // Clear text input
        document.getElementById('text-sprites').value = '';
    }
}

async function handleTextSpritesInput(e) {
    const text = e.target.value.trim();
    
    // Clear existing text sprites
    textSprites = [];
    
    if (!text) {
        updateTotalSpriteCount();
        checkRenderingConditions();
        return;
    }
    
    // Split text into individual characters, handling emojis properly
    const characters = [...text];
    
    if (characters.length === 0) {
        updateTotalSpriteCount();
        checkRenderingConditions();
        return;
    }
    
    const totalSprites = imageSprites.length + characters.length;
    if (totalSprites > 32) {
        showWarning(`Too many sprites. Maximum 32 total (${imageSprites.length} images + ${characters.length} characters = ${totalSprites})`);
        return;
    }
    
    // Generate sprites from characters
    for (const char of characters) {
        try {
            const sprite = await createCharacterSpriteObject(char);
            textSprites.push(sprite);
        } catch (error) {
            console.warn(`Failed to create sprite for character "${char}":`, error);
        }
    }
    
    updateTotalSpriteCount();
    checkRenderingConditions();
}

function checkRenderingConditions() {
    const totalSprites = getAllSprites();
    if (totalSprites.length >= 2) {
        if (!animationId) {
            statusText.textContent = 'Rendering sprite rasterization...';
            startRendering();
        } else if (rasterizer && rasterizer.atlas) {
            rasterizer.updateAtlas(totalSprites).catch(error => {
                showError('Failed to update texture atlas: ' + error.message);
            });
        }
    } else {
        stopRendering();
        statusText.textContent = totalSprites.length === 0 ? 'Add at least 2 characters or sprite images to begin' : 'Add 1 more character or sprite image to begin rendering';
    }
}

async function createCharacterSpriteObject(character) {
    // Create a canvas to render the character
    const canvas = document.createElement('canvas');
    const size = 64; // Size for character sprites
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Set up the canvas for character rendering with transparency
    ctx.clearRect(0, 0, size, size); // Transparent background
    
    // Set up text styling  
    const selectedColor = document.getElementById('text-color').value;
    ctx.fillStyle = selectedColor; // Use selected text color
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size * 0.7}px Arial, sans-serif`; // Font size relative to canvas size
    
    // Draw the character centered
    ctx.fillText(character, size / 2, size / 2);
    
    // Create an image element from the canvas
    const img = new Image();
    const dataURL = canvas.toDataURL('image/png');
    img.src = dataURL;
    
    // Wait for image to load
    await new Promise((resolve) => {
        img.onload = resolve;
    });
    
    // Create sprite object
    const sprite = {
        id: Date.now() + Math.random(),
        image: img,
        name: `char-${character}`,
        width: img.width,
        height: img.height,
        isTextSprite: true
    };
    
    // Set normalized dimensions based on existing sprites or default
    const allSprites = getAllSprites();
    if (allSprites.length > 0) {
        const firstSprite = allSprites[0];
        sprite.normalizedWidth = firstSprite.normalizedWidth;
        sprite.normalizedHeight = firstSprite.normalizedHeight;
    } else {
        sprite.normalizedWidth = img.width;
        sprite.normalizedHeight = img.height;
        updateDefaultGridSize();
    }
    
    return sprite;
}

//==============================================================================
// CONTROL PANEL HANDLERS
//==============================================================================

function updateScale(e) {
    const scaleVal = parseFloat(e.target.value);
    scaleValue.textContent = scaleVal.toFixed(1) + 'x';
    updateGridDisplay();
}

function getCurrentGridDimensions() {
    const scaleVal = parseFloat(scale.value);
    return {
        width: Math.round(baseGridWidth * scaleVal),
        height: Math.round(baseGridHeight * scaleVal)
    };
}

function updateGridDisplay() {
    const { width, height } = getCurrentGridDimensions();
    const totalSprites = width * height;
    gridDisplay.textContent = `${width}x${height} (${totalSprites.toLocaleString()} sprites)`;
}


function updateThreshold(e) {
    const value = parseFloat(e.target.value);
    thresholdValue.textContent = value.toFixed(2);
}

function updateMatchingAlgorithm(e) {
    if (rasterizer) {
        rasterizer.setSelectionMode(e.target.value);
    }
}


//==============================================================================
// SPRITE CAPTURE SYSTEM
//==============================================================================
function setupCaptureModal() {
    const modal = document.getElementById('capture-modal');
    const captureVideo = document.getElementById('capture-video');
    const captureCanvas = document.getElementById('capture-canvas');
    const countdown = document.getElementById('countdown');
    const startCaptureBtn = document.getElementById('start-capture');
    const instantCaptureBtn = document.getElementById('instant-capture');
    const closeBtn = document.getElementById('close-capture');
    
    let captureStream = null;
    let countdownTimer = null;
    
    startCaptureBtn.addEventListener('click', async () => {
        if (sprites.length >= 32) {
            showError('Maximum 32 sprites allowed');
            return;
        }
        
        startCaptureBtn.classList.add('hidden');
        instantCaptureBtn.classList.add('hidden');
        countdown.classList.remove('hidden');
        
        // Start countdown
        let count = 3;
        countdown.textContent = count;
        
        countdownTimer = setInterval(() => {
            count--;
            if (count > 0) {
                countdown.textContent = count;
            } else {
                clearInterval(countdownTimer);
                countdown.textContent = 'CAPTURE!';
                
                setTimeout(() => {
                    captureFrame();
                    countdown.classList.add('hidden');
                }, 500);
            }
        }, 1000);
    });
    
    instantCaptureBtn.addEventListener('click', () => {
        if (sprites.length >= 32) {
            showError('Maximum 32 sprites allowed');
            return;
        }
        
        captureFrame();
    });
    
    
    closeBtn.addEventListener('click', closeCaptureModal);
    
    // Function to open the capture modal
    window.openCaptureModal = async function() {
        if (!webcamStream || !webcam.srcObject) {
            showError('Webcam not available for sprite capture');
            return;
        }
        
        // Set up capture video with webcam stream
        captureVideo.srcObject = webcamStream;
        
        // Ensure capture video is mirrored
        mirrorVideoElement(captureVideo);
        
        // Show modal
        modal.classList.add('active');
        
        // Reset UI
        resetCaptureUI();
    };
    
    async function saveCurrentCapture() {
        const canvas = captureCanvas;
        return new Promise((resolve) => {
            canvas.toBlob(async (blob) => {
                if (blob) {
                    try {
                        const file = new File([blob], 'captured-sprite.png', { type: 'image/png' });
                        await addSprite(file);
                        showSuccess('Sprite captured successfully!');
                    } catch (error) {
                        showError('Failed to save captured sprite: ' + error.message);
                    }
                }
                resolve();
            });
        });
    }
    
    function resetCaptureUI() {
        captureVideo.classList.remove('hidden');
        captureCanvas.classList.add('hidden');
        startCaptureBtn.classList.remove('hidden');
        instantCaptureBtn.classList.remove('hidden');
    }
    
    async function captureFrame() {
        const canvas = captureCanvas;
        const video = captureVideo;
        
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Create mirrored context for webcam capture
        const ctx = createMirroredCanvasContext(video, canvas);
        
        // Draw current video frame (will be mirrored)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Restore context
        restoreCanvasContext(ctx);
        
        // Normalize to first sprite dimensions if needed
        if (sprites.length > 0) {
            const firstSprite = sprites[0];
            const normalizedCanvas = document.createElement('canvas');
            const normalizedCtx = normalizedCanvas.getContext('2d');
            
            normalizedCanvas.width = firstSprite.normalizedWidth;
            normalizedCanvas.height = firstSprite.normalizedHeight;
            
            normalizedCtx.drawImage(canvas, 0, 0, normalizedCanvas.width, normalizedCanvas.height);
            
            // Replace capture canvas content
            canvas.width = normalizedCanvas.width;
            canvas.height = normalizedCanvas.height;
            ctx.drawImage(normalizedCanvas, 0, 0);
        }
        
        // Save instantly without confirmation
        await saveCurrentCapture();
        
        // Reset UI for next capture
        resetCaptureUI();
    }
    
    function closeCaptureModal() {
        modal.classList.remove('active');
        if (captureStream) {
            captureStream.getTracks().forEach(track => track.stop());
            captureStream = null;
        }
        
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        
        // Reset UI
        countdown.classList.add('hidden');
        resetCaptureUI();
    }
}

async function handleSpriteCapture() {
    if (sprites.length >= 32) {
        showError('Maximum 32 sprites allowed');
        return;
    }
    
    // Check if webcam is available and active
    if (!webcamStream || !webcam.srcObject) {
        showError('Webcam not available for sprite capture');
        return;
    }
    
    // Open the capture modal instead of direct capture
    if (window.openCaptureModal) {
        window.openCaptureModal();
    } else {
        showError('Capture modal not available');
    }
}

//==============================================================================
// NOTIFICATION SYSTEM
//==============================================================================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 5000);
}

function showError(message) {
    console.error(message);
    showToast(message, 'error');
}

function showSuccess(message) {
    console.log(message);
    showToast(message, 'success');
}

function showWarning(message) {
    console.warn(message);
    showToast(message, 'warning');
}

//==============================================================================
// WEBGL SPRITE RASTERIZER
//==============================================================================
class SpriteRasterizer {
    constructor(canvas) {
        this.canvas = canvas;
        const contextAttributes = { alpha: true, premultipliedAlpha: false };
        this.gl = canvas.getContext('webgl2', contextAttributes) || canvas.getContext('webgl', contextAttributes);
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }
        
        this.selector = null;
        this.atlas = null;
        this.program = null;
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.spriteData = [];
        
        this.initShaders();
        this.initBuffers();
    }
    
    initShaders() {
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            attribute float a_spriteIndex;
            
            uniform vec2 u_resolution;
            uniform vec2 u_spriteSize;
            
            varying vec2 v_texCoord;
            varying float v_spriteIndex;
            
            void main() {
                vec2 position = a_position * u_spriteSize;
                vec2 clipSpace = ((position / u_resolution) * 2.0) - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                
                v_texCoord = a_texCoord;
                v_spriteIndex = a_spriteIndex;
            }
        `;
        
        const fragmentShaderSource = `
            precision mediump float;
            
            uniform sampler2D u_atlas;
            uniform vec2 u_atlasSize;
            uniform vec4 u_spriteUVs[32];
            
            varying vec2 v_texCoord;
            varying float v_spriteIndex;
            
            vec4 getSpriteUV(float index) {
                // Use conditional branches instead of dynamic indexing
                if (index < 0.5) return u_spriteUVs[0];
                else if (index < 1.5) return u_spriteUVs[1];
                else if (index < 2.5) return u_spriteUVs[2];
                else if (index < 3.5) return u_spriteUVs[3];
                else if (index < 4.5) return u_spriteUVs[4];
                else if (index < 5.5) return u_spriteUVs[5];
                else if (index < 6.5) return u_spriteUVs[6];
                else if (index < 7.5) return u_spriteUVs[7];
                else if (index < 8.5) return u_spriteUVs[8];
                else if (index < 9.5) return u_spriteUVs[9];
                else if (index < 10.5) return u_spriteUVs[10];
                else if (index < 11.5) return u_spriteUVs[11];
                else if (index < 12.5) return u_spriteUVs[12];
                else if (index < 13.5) return u_spriteUVs[13];
                else if (index < 14.5) return u_spriteUVs[14];
                else if (index < 15.5) return u_spriteUVs[15];
                else if (index < 16.5) return u_spriteUVs[16];
                else if (index < 17.5) return u_spriteUVs[17];
                else if (index < 18.5) return u_spriteUVs[18];
                else if (index < 19.5) return u_spriteUVs[19];
                else if (index < 20.5) return u_spriteUVs[20];
                else if (index < 21.5) return u_spriteUVs[21];
                else if (index < 22.5) return u_spriteUVs[22];
                else if (index < 23.5) return u_spriteUVs[23];
                else if (index < 24.5) return u_spriteUVs[24];
                else if (index < 25.5) return u_spriteUVs[25];
                else if (index < 26.5) return u_spriteUVs[26];
                else if (index < 27.5) return u_spriteUVs[27];
                else if (index < 28.5) return u_spriteUVs[28];
                else if (index < 29.5) return u_spriteUVs[29];
                else if (index < 30.5) return u_spriteUVs[30];
                else return u_spriteUVs[31];
            }
            
            void main() {
                if (v_spriteIndex < 0.0 || v_spriteIndex >= 32.0) {
                    gl_FragColor = vec4(0, 0, 0, 0);
                    return;
                }
                
                vec4 spriteUV = getSpriteUV(v_spriteIndex);
                vec2 uv = spriteUV.xy + v_texCoord * spriteUV.zw;
                gl_FragColor = texture2D(u_atlas, uv);
            }
        `;
        
        this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);
        this.gl.useProgram(this.program);
        
        // Get uniform and attribute locations
        this.uniforms = {
            resolution: this.gl.getUniformLocation(this.program, 'u_resolution'),
            spriteSize: this.gl.getUniformLocation(this.program, 'u_spriteSize'),
            atlas: this.gl.getUniformLocation(this.program, 'u_atlas'),
            atlasSize: this.gl.getUniformLocation(this.program, 'u_atlasSize'),
            spriteUVs: this.gl.getUniformLocation(this.program, 'u_spriteUVs')
        };
        
        this.attributes = {
            position: this.gl.getAttribLocation(this.program, 'a_position'),
            texCoord: this.gl.getAttribLocation(this.program, 'a_texCoord'),
            spriteIndex: this.gl.getAttribLocation(this.program, 'a_spriteIndex')
        };
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    createProgram(vertexSource, fragmentSource) {
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
        
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }
    
    initBuffers() {
        this.vertexBuffer = this.gl.createBuffer();
        this.indexBuffer = this.gl.createBuffer();
    }
    
    async generateTextureAtlas(sprites) {
        const maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
        const spriteCount = sprites.length;
        
        if (spriteCount === 0) return null;
        
        // Calculate atlas layout
        const cols = Math.ceil(Math.sqrt(spriteCount));
        const rows = Math.ceil(spriteCount / cols);
        
        const spriteWidth = sprites[0].normalizedWidth;
        const spriteHeight = sprites[0].normalizedHeight;
        
        const atlasWidth = cols * spriteWidth;
        const atlasHeight = rows * spriteHeight;
        
        if (atlasWidth > maxTextureSize || atlasHeight > maxTextureSize) {
            throw new Error(`Atlas too large: ${atlasWidth}x${atlasHeight}, max: ${maxTextureSize}`);
        }
        
        // Create atlas canvas
        const canvas = document.createElement('canvas');
        canvas.width = atlasWidth;
        canvas.height = atlasHeight;
        const ctx = canvas.getContext('2d');
        
        // Clear to transparent and ensure alpha channel is preserved
        ctx.clearRect(0, 0, atlasWidth, atlasHeight);
        
        // Enable proper alpha blending for transparency
        ctx.globalCompositeOperation = 'source-over';
        
        // Pack sprites and generate UV coordinates
        const spriteUVs = [];
        
        for (let i = 0; i < sprites.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * spriteWidth;
            const y = row * spriteHeight;
            
            // Draw sprite to atlas
            ctx.drawImage(sprites[i].image, x, y, spriteWidth, spriteHeight);
            
            // Calculate UV coordinates (normalized 0-1)
            const u = x / atlasWidth;
            const v = y / atlasHeight;
            const w = spriteWidth / atlasWidth;
            const h = spriteHeight / atlasHeight;
            
            spriteUVs.push([u, v, w, h]);
        }
        
        // Create WebGL texture
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
        
        // Set texture parameters
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        
        // Pre-calculate sprite averages for selection algorithms
        const spriteAverages = await this.calculateSpriteAverages(sprites);
        
        return {
            texture,
            width: atlasWidth,
            height: atlasHeight,
            spriteUVs,
            spriteAverages
        };
    }
    
    async calculateSpriteAverages(sprites) {
        const averages = [];
        
        for (const sprite of sprites) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = sprite.normalizedWidth;
            canvas.height = sprite.normalizedHeight;
            
            ctx.drawImage(sprite.image, 0, 0, sprite.normalizedWidth, sprite.normalizedHeight);
            const imageData = ctx.getImageData(0, 0, sprite.normalizedWidth, sprite.normalizedHeight);
            const data = imageData.data;
            
            let r = 0, g = 0, b = 0, count = 0;
            
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) { // Only count non-transparent pixels
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                }
            }
            
            if (count > 0) {
                r /= count;
                g /= count;
                b /= count;
            }
            
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            
            averages.push({ r, g, b, brightness });
        }
        
        return averages;
    }
    
    setSelectionMode(mode) {
        this.selector = createSpriteSelector(mode);
    }
    
    updateAtlas(sprites) {
        return this.generateTextureAtlas(sprites).then(atlas => {
            if (this.atlas && this.atlas.texture) {
                this.gl.deleteTexture(this.atlas.texture);
            }
            this.atlas = atlas;
            return atlas;
        });
    }
    
    render(sourceElement, gridWidth, gridHeight) {
        if (!this.atlas || !this.selector) return;
        
        if (sprites.length === 0) return;
        
        // Get source dimensions for aspect ratio calculation
        let sourceWidth, sourceHeight;
        if (sourceElement.tagName === 'VIDEO') {
            sourceWidth = sourceElement.videoWidth || sourceElement.width;
            sourceHeight = sourceElement.videoHeight || sourceElement.height;
        } else if (sourceElement.tagName === 'IMG') {
            sourceWidth = sourceElement.naturalWidth || sourceElement.width;
            sourceHeight = sourceElement.naturalHeight || sourceElement.height;
        }
        
        if (!sourceWidth || !sourceHeight) {
            sourceWidth = 320;
            sourceHeight = 240;
        }
        
        // Calculate canvas size to fit in viewport while maintaining aspect ratio
        const containerElement = this.canvas.parentElement;
        const maxWidth = containerElement.clientWidth - 40; // Some padding
        const maxHeight = containerElement.clientHeight - 40;
        
        // Calculate sprite size based on fitting the entire rasterized image in viewport
        const sourceAspectRatio = sourceWidth / sourceHeight;
        
        let canvasWidth, canvasHeight;
        
        // Determine which dimension constrains us
        const widthConstrained = maxWidth / maxHeight < sourceAspectRatio;
        
        if (widthConstrained) {
            canvasWidth = maxWidth;
            canvasHeight = maxWidth / sourceAspectRatio;
        } else {
            canvasHeight = maxHeight;
            canvasWidth = maxHeight * sourceAspectRatio;
        }
        
        // Calculate sprite dimensions - stretch sprites to match grid aspect ratio
        const spriteWidth = canvasWidth / gridWidth;
        const spriteHeight = canvasHeight / gridHeight;
        
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        
        this.gl.viewport(0, 0, canvasWidth, canvasHeight);
        // Clear with transparent background so CSS background shows through
        this.gl.clearColor(0, 0, 0, 0); // Transparent background
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        
        // Enable blending for transparency
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        
        // Disable depth testing to ensure all sprites render
        this.gl.disable(this.gl.DEPTH_TEST);
        
        // Ensure all triangles are rendered (disable culling)
        this.gl.disable(this.gl.CULL_FACE);
        
        // Get source image data
        const sourceCanvas = document.createElement('canvas');
        const sourceCtx = sourceCanvas.getContext('2d');
        sourceCanvas.width = gridWidth;
        sourceCanvas.height = gridHeight;
        
        // Draw source to canvas at grid resolution
        if (sourceElement.tagName === 'VIDEO') {
            // Use mirrored drawing for webcam input
            const mirroredCtx = createMirroredCanvasContext(sourceElement, sourceCanvas);
            mirroredCtx.drawImage(sourceElement, 0, 0, gridWidth, gridHeight);
            restoreCanvasContext(mirroredCtx);
        } else if (sourceElement.tagName === 'IMG') {
            sourceCtx.drawImage(sourceElement, 0, 0, gridWidth, gridHeight);
        }
        
        const imageData = sourceCtx.getImageData(0, 0, gridWidth, gridHeight);
        
        // Generate sprite indices
        const spriteIndices = this.generateSpriteIndices(imageData, gridWidth, gridHeight);
        
        // Create geometry
        const vertices = [];
        const indices = [];
        let vertexIndex = 0;
        
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                let spriteIndex = spriteIndices[y * gridWidth + x];
                
                // Additional safety validation at render time
                if (spriteIndex === undefined || spriteIndex === null || isNaN(spriteIndex) || 
                    spriteIndex < 0 || spriteIndex >= this.atlas.spriteAverages.length) {
                    console.warn(`Invalid sprite index at (${x}, ${y}):`, spriteIndex, 'defaulting to 0');
                    spriteIndex = 0;
                }
                
                // Quad vertices (position, texCoord, spriteIndex)
                vertices.push(
                    x, y, 0, 0, spriteIndex,           // Top-left
                    x + 1, y, 1, 0, spriteIndex,       // Top-right
                    x + 1, y + 1, 1, 1, spriteIndex,   // Bottom-right
                    x, y + 1, 0, 1, spriteIndex        // Bottom-left
                );
                
                // Two triangles per quad
                indices.push(
                    vertexIndex, vertexIndex + 1, vertexIndex + 2,
                    vertexIndex, vertexIndex + 2, vertexIndex + 3
                );
                
                vertexIndex += 4;
            }
        }
        
        // Use the shader program
        this.gl.useProgram(this.program);
        
        // Upload vertex data
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.DYNAMIC_DRAW);
        
        // Upload index data
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.DYNAMIC_DRAW);
        
        // Set up attributes
        const stride = 5 * 4; // 5 floats per vertex, 4 bytes per float
        this.gl.vertexAttribPointer(this.attributes.position, 2, this.gl.FLOAT, false, stride, 0);
        this.gl.vertexAttribPointer(this.attributes.texCoord, 2, this.gl.FLOAT, false, stride, 2 * 4);
        this.gl.vertexAttribPointer(this.attributes.spriteIndex, 1, this.gl.FLOAT, false, stride, 4 * 4);
        
        this.gl.enableVertexAttribArray(this.attributes.position);
        this.gl.enableVertexAttribArray(this.attributes.texCoord);
        this.gl.enableVertexAttribArray(this.attributes.spriteIndex);
        
        // Set uniforms
        this.gl.uniform2f(this.uniforms.resolution, canvasWidth, canvasHeight);
        this.gl.uniform2f(this.uniforms.spriteSize, spriteWidth, spriteHeight);
        this.gl.uniform2f(this.uniforms.atlasSize, this.atlas.width, this.atlas.height);
        
        // Bind texture
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.atlas.texture);
        this.gl.uniform1i(this.uniforms.atlas, 0);
        
        // Set sprite UVs
        const uvArray = new Float32Array(32 * 4);
        for (let i = 0; i < Math.min(32, this.atlas.spriteUVs.length); i++) {
            const uv = this.atlas.spriteUVs[i];
            uvArray[i * 4] = uv[0];
            uvArray[i * 4 + 1] = uv[1];
            uvArray[i * 4 + 2] = uv[2];
            uvArray[i * 4 + 3] = uv[3];
        }
        this.gl.uniform4fv(this.uniforms.spriteUVs, uvArray);
        
        // Draw all triangles
        this.gl.drawElements(this.gl.TRIANGLES, indices.length, this.gl.UNSIGNED_SHORT, 0);
        
        // Check for WebGL errors
        const error = this.gl.getError();
        if (error !== this.gl.NO_ERROR) {
            console.error('WebGL error during drawing:', error, 'Triangles:', indices.length / 3);
        }
    }
    
    generateSpriteIndices(imageData, width, height) {
        const data = imageData.data;
        const indices = new Array(width * height);
        
        // Use number of sprites as the posterization levels, modified by threshold slider
        const spriteCount = this.atlas.spriteAverages.length;
        const thresholdMultiplier = parseFloat(threshold.value);
        const thresholdLevels = Math.max(2, Math.round(spriteCount * thresholdMultiplier));
        const step = 255 / (thresholdLevels - 1);
        
        for (let i = 0; i < width * height; i++) {
            const pixelIndex = i * 4;
            let r = data[pixelIndex];
            let g = data[pixelIndex + 1];
            let b = data[pixelIndex + 2];
            const a = data[pixelIndex + 3];
            
            if (a === 0) {
                indices[i] = 0; // Use first sprite for transparent pixels
            } else {
                // Apply posterization effect based on sprite count
                r = Math.round(r / step) * step;
                g = Math.round(g / step) * step;
                b = Math.round(b / step) * step;
                
                // Clamp values to 0-255 range
                r = Math.min(255, Math.max(0, r));
                g = Math.min(255, Math.max(0, g));
                b = Math.min(255, Math.max(0, b));
                
                let spriteIndex = this.selector.selectSprite({ r, g, b }, this.atlas.spriteAverages);
                
                // Ensure we always have a valid sprite index
                if (spriteIndex === undefined || spriteIndex === null || spriteIndex < 0 || spriteIndex >= spriteCount) {
                    spriteIndex = 0; // Fallback to first sprite
                }
                
                indices[i] = spriteIndex;
            }
        }
        
        return indices;
    }
}

//==============================================================================
// SPRITE SELECTION ALGORITHMS
//==============================================================================
class SpriteSelector {
    selectSprite() {
        return 0;
    }
}

class ColorSpriteSelector extends SpriteSelector {
    selectSprite(regionData, spriteAverages) {
        // Safety check: ensure we have sprites
        if (!spriteAverages || spriteAverages.length === 0) {
            return 0;
        }
        
        let bestIndex = 0;
        let bestDistance = Infinity;
        
        const { r, g, b } = regionData;
        
        for (let i = 0; i < spriteAverages.length; i++) {
            const sprite = spriteAverages[i];
            if (!sprite) continue; // Skip invalid sprites
            
            const distance = Math.sqrt(
                Math.pow(r - sprite.r, 2) +
                Math.pow(g - sprite.g, 2) +
                Math.pow(b - sprite.b, 2)
            );
            
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        
        // Ensure valid index
        return Math.max(0, Math.min(bestIndex, spriteAverages.length - 1));
    }
}

class BrightnessSpriteSelector extends SpriteSelector {
    selectSprite(regionData, spriteAverages) {
        // Safety check: ensure we have sprites
        if (!spriteAverages || spriteAverages.length === 0) {
            return 0;
        }
        
        let bestIndex = 0;
        let bestDistance = Infinity;
        
        const brightness = 0.299 * regionData.r + 0.587 * regionData.g + 0.114 * regionData.b;
        
        for (let i = 0; i < spriteAverages.length; i++) {
            const sprite = spriteAverages[i];
            if (!sprite) continue; // Skip invalid sprites
            
            const distance = Math.abs(brightness - sprite.brightness);
            
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        
        // Ensure valid index
        return Math.max(0, Math.min(bestIndex, spriteAverages.length - 1));
    }
}

function createSpriteSelector(mode) {
    switch(mode) {
        case 'color': return new ColorSpriteSelector();
        case 'brightness': return new BrightnessSpriteSelector();
        default: return new ColorSpriteSelector();
    }
}

//==============================================================================
// RENDERING SYSTEM
//==============================================================================
function initRasterizer() {
    try {
        rasterizer = new SpriteRasterizer(outputCanvas);
        rasterizer.setSelectionMode('color');
        
        // Handle WebGL context loss
        outputCanvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            showWarning('WebGL context lost - attempting recovery...');
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        });
        
        outputCanvas.addEventListener('webglcontextrestored', () => {
            try {
                rasterizer = new SpriteRasterizer(outputCanvas);
                rasterizer.setSelectionMode(document.querySelector('input[name="matching"]:checked').value);
                
                if (sprites.length >= 2) {
                    startRendering();
                }
                
                showSuccess('WebGL context restored successfully');
            } catch (error) {
                showError('Failed to restore WebGL context: ' + error.message);
            }
        });
        
    } catch (error) {
        showError('Failed to initialize WebGL: ' + error.message);
        console.error(error);
    }
}

function startRendering() {
    if (sprites.length >= 2 && rasterizer) {
        // Ensure we have a source before rendering
        if (!webcamStream && !staticImage.src) {
            createDefaultTestPattern();
            // Wait a moment for the test pattern to load before starting
            setTimeout(() => {
                actuallyStartRendering();
            }, 100);
        } else {
            actuallyStartRendering();
        }
    }
}

function actuallyStartRendering() {
    outputCanvas.classList.remove('hidden');
    
    // Prefer webcam if available, otherwise keep static image visible
    if (webcamStream && webcam.srcObject) {
        // We have a working webcam - use it for live video
        webcam.classList.toggle('hidden');  // Show webcam
        // staticImage.classList.toggle('hidden'); // Hide static image
        // sourceStatus.textContent = '🎥 Webcam';
        resetSource.classList.toggle('hidden'); // Hide reset button
    } else {
        // No webcam - use static image (test pattern)
        webcam.classList.toggle('hidden');     // Hide webcam
        // staticImage.classList.toggle('hidden'); // Show static image
    }
    
    // Update texture atlas
    rasterizer.updateAtlas(sprites).then(() => {
        // Start render loop
        renderLoop();
    }).catch(error => {
        console.error('Atlas creation failed:', error);
        showError('Failed to create texture atlas: ' + error.message);
    });
}

function stopRendering() {
    outputCanvas.classList.add('hidden');
    
    
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

function renderLoop(timestamp = 0) {
    if (!rasterizer || !rasterizer.atlas) {
        return;
    }
    
    // Calculate FPS
    frameCount++;
    if (timestamp - lastFpsUpdate >= 500) {
        const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
        fpsCounter.textContent = fps;
        frameCount = 0;
        lastFpsUpdate = timestamp;
    }
    
    // Get current source (check which is the active input)
    // Priority: live webcam > static image > no source
    let sourceElement;
    if (webcamStream && webcam.srcObject && !webcam.classList.contains('hidden')) {
        // Use live webcam if available and not hidden
        sourceElement = webcam;
    } else if (staticImage.src) {
        // Fall back to static image (test pattern or user image)
        sourceElement = staticImage;
    } else {
        // No valid source available - skip this frame
        animationId = requestAnimationFrame(renderLoop);
        return;
    }
    
    // Performance optimization: skip render if source not ready
    if (sourceElement.tagName === 'VIDEO' && (sourceElement.readyState < 2 || sourceElement.videoWidth === 0)) {
        animationId = requestAnimationFrame(renderLoop);
        return;
    }
    
    // Performance optimization: limit large grid updates
    const { width: gridW, height: gridH } = getCurrentGridDimensions();
    const totalSprites = gridW * gridH;
    
    if (totalSprites > 250000) { // 500x500
        // Reduce frame rate for very large grids
        const now = performance.now();
        if (now - lastFrameTime < 33.33) { // ~30fps max
            animationId = requestAnimationFrame(renderLoop);
            return;
        }
        lastFrameTime = now;
    }
    
    // Render frame
    try {
        rasterizer.render(sourceElement, gridW, gridH);
        
    } catch (error) {
        console.error('Render error:', error);
        showError('Render error: ' + error.message);
        
        // Stop rendering on critical errors
        if (error.message.includes('WebGL') || error.message.includes('context')) {
            return;
        }
    }
    
    animationId = requestAnimationFrame(renderLoop);
}

//==============================================================================
// APPLICATION ENTRY POINT
//==============================================================================

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);