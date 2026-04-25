// --- State Management ---
let sessionHistory = [];
let totalAnalyses = 0;
let totalConfidence = 0;
let categoryCounts = {};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    updateFooterYear();
    initHistory();
    populateCategories();
});

function updateFooterYear() {
    document.getElementById('footerYear').textContent = new Date().getFullYear();
}

// --- Tab Navigation ---
function showTab(tabId) {
    // Update Nav Buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById('nav' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
    if (activeBtn) activeBtn.classList.add('active');

    // Update Panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');
}

// --- Drag & Drop Handlers ---
function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('drag-over');
    const files = e.dataTransfer.files;
    checkFiles(files);
}

// --- Core Logic: File Checking & Analysis ---
function checkFiles(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    
    // Validation
    if (!file.type.match('image.*')) {
        showToast("Bitte lade nur Bilddateien (PNG, JPEG) hoch.");
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast("Die Datei ist zu groß (max. 10MB).");
        return;
    }

    // Prepare UI
    document.getElementById("uploadCard").classList.add("hidden");
    document.getElementById("answerPart").classList.remove("hidden");
    document.getElementById("loadingPart").style.display = "block";
    document.getElementById("resultsPart").style.display = "none";
    document.getElementById("errorPart").style.display = "none";
    
    // Set Filename
    document.getElementById("fileName").textContent = file.name;
    
    // Set Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById("preview").src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Analysis Logic
    performAnalysis(file);
}

function performAnalysis(file) {
    const formData = new FormData();
    formData.append("image", file);

    const startTime = performance.now();

    fetch('/analyze', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) throw new Error("Server-Fehler: " + response.status);
        return response.json();
    })
    .then(data => {
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        document.getElementById("loadingPart").style.display = "none";
        document.getElementById("resultsPart").style.display = "grid";
        document.getElementById("analysisTime").textContent = `Analyse abgeschlossen in ${duration}s`;
        
        processResults(data, file);
    })
    .catch(error => {
        console.error("Analysis Error:", error);
        document.getElementById("loadingPart").style.display = "none";
        document.getElementById("errorPart").style.display = "block";
        document.getElementById("errorMsg").textContent = error.message;
    });
}

function processResults(jsonData, file) {
    let classifications = [];
    
    // Normalize DJL response formats
    if (Array.isArray(jsonData)) {
        classifications = jsonData.map(item => ({
            className: item.className || item.class || item.name,
            probability: parseFloat(item.probability || 0)
        }));
    } else if (jsonData.classes && Array.isArray(jsonData.classes)) {
        classifications = jsonData.classes.map(item => ({
            className: item.className || item.class || item.name,
            probability: parseFloat(item.probability || 0)
        }));
    } else if (typeof jsonData === 'object') {
        for (const [key, value] of Object.entries(jsonData)) {
            if (typeof value === 'number') {
                classifications.push({ className: key, probability: value });
            }
        }
    }
    
    classifications.sort((a, b) => b.probability - a.probability);
    
    if (classifications.length > 0) {
        displayResults(classifications);
        addToHistory(classifications[0], file);
        updateStats(classifications[0].probability, classifications[0].className);
    }
}

function displayResults(classifications) {
    const top = classifications[0];
    const topLabel = top.className || "Unbekannt";
    const topProb = (top.probability * 100).toFixed(1);
    
    // Display Top Result
    document.getElementById("topLabel").textContent = topLabel;
    document.getElementById("topPercentage").textContent = topProb + "%";
    document.getElementById("topConfidenceFill").style.width = topProb + "%";
    document.getElementById("topResult").style.display = "block";
    
    // Set Emoji based on category
    const emojiMap = {
        'sneaker': '👟', 'boots': '🥾', 'sandal': '🩴', 'heel': '👠', 'shoe': '👞', 'running': '👟'
    };
    let foundEmoji = '👟';
    for(let key in emojiMap) {
        if(topLabel.toLowerCase().includes(key)) {
            foundEmoji = emojiMap[key];
            break;
        }
    }
    document.getElementById("topEmoji").textContent = foundEmoji;

    // Display List (rest)
    let listHTML = "";
    classifications.forEach((item, index) => {
        if (index === 0) return; // Skip top
        const prob = (item.probability * 100).toFixed(1);
        listHTML += `
            <div class="classification-item">
                <div class="classification-label">${item.className}</div>
                <div class="classification-bar">
                    <div class="progress-bar" style="width: ${prob}%"></div>
                </div>
                <div class="classification-percentage">${prob}%</div>
            </div>
        `;
    });
    document.getElementById("classificationList").innerHTML = listHTML;
}

// --- History & Stats ---
function addToHistory(topResult, file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const item = {
            id: Date.now(),
            label: topResult.className,
            prob: (topResult.probability * 100).toFixed(1),
            thumb: e.target.result,
            time: new Date().toLocaleTimeString()
        };
        sessionHistory.unshift(item);
        renderHistory();
        updateHistoryBadge();
    };
    reader.readAsDataURL(file);
}

function renderHistory() {
    const list = document.getElementById("historyList");
    if (sessionHistory.length === 0) {
        list.innerHTML = `<div class="history-empty"><div class="history-empty-icon">👟</div><p>Noch keine Analysen vorhanden.</p></div>`;
        return;
    }

    list.innerHTML = sessionHistory.map(item => `
        <div class="history-item">
            <img src="${item.thumb}" class="history-thumb" alt="History Thumb">
            <div class="history-info">
                <div class="history-label">${item.label}</div>
                <div class="history-meta">${item.prob}% • ${item.time}</div>
            </div>
        </div>
    `).join('');
}

function updateHistoryBadge() {
    document.getElementById("historyBadge").textContent = sessionHistory.length;
}

function clearHistory() {
    sessionHistory = [];
    renderHistory();
    updateHistoryBadge();
    showToast("Verlauf gelöscht.");
}

function updateStats(prob, category) {
    totalAnalyses++;
    totalConfidence += prob;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    document.getElementById("statsBar").style.display = "flex";
    document.getElementById("statTotal").textContent = totalAnalyses;
    document.getElementById("statAvgConf").textContent = ((totalConfidence / totalAnalyses) * 100).toFixed(0) + "%";
    
    let topCat = "—";
    let max = 0;
    for (let cat in categoryCounts) {
        if (categoryCounts[cat] > max) {
            max = categoryCounts[cat];
            topCat = cat;
        }
    }
    document.getElementById("statTopCat").textContent = topCat;
}

// --- Helpers ---
function analyzeNew() {
    document.getElementById("uploadCard").classList.remove("hidden");
    document.getElementById("answerPart").classList.add("hidden");
    document.getElementById("imageInput").value = "";
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 3000);
}

function downloadResult() {
    const topLabel = document.getElementById("topLabel").textContent;
    const topProb = document.getElementById("topPercentage").textContent;
    const blob = new Blob([`SoleAI Result\nCategory: ${topLabel}\nConfidence: ${topProb}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classification_${topLabel}.txt`;
    a.click();
}

function shareResult() {
    if (navigator.share) {
        navigator.share({
            title: 'SoleAI Footwear Analysis',
            text: `Meine Schuhe wurden als ${document.getElementById("topLabel").textContent} erkannt!`,
            url: window.location.href
        }).catch(console.error);
    } else {
        showToast("Teilen wird von diesem Browser nicht unterstützt.");
    }
}

function populateCategories() {
    const cats = ["Sneaker", "Stiefel", "Sandalen", "Pumps", "Slipper", "Sportschuhe"];
    document.getElementById("categoryGrid").innerHTML = cats.map(c => `<span class="format-badge">${c}</span>`).join('');
}

