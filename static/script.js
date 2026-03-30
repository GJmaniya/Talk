let socket;
let clientId = localStorage.getItem("talk_clientId") || "";
let roomCode = localStorage.getItem("talk_roomCode") || "";

// State
function switchStep(id) {
    ["step-name", "step-choice", "step-join", "step-create"].forEach(s => document.getElementById(s)?.classList.add("hidden"));
    if (id) document.getElementById(id)?.classList.remove("hidden");
}

function generateLocalPin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Check for existing session on load
window.onload = () => {
    if (clientId && roomCode) {
        connectToChat();
    } else {
        switchStep("step-name");
    }
};

// 1. Next step (Name)
document.getElementById("next-btn").onclick = () => {
    clientId = document.getElementById("username").value.trim();
    if (!clientId) return alert("Please enter your name!");
    localStorage.setItem("talk_clientId", clientId);
    document.getElementById("hello-user").textContent = clientId;
    switchStep("step-choice");
};

// 2. Choice (Create/Join)
document.getElementById("create-room-btn").onclick = () => {
    roomCode = generateLocalPin();
    localStorage.setItem("talk_roomCode", roomCode);
    document.getElementById("generated-pin").textContent = roomCode;
    switchStep("step-create");
};
document.getElementById("join-room-nav-btn").onclick = () => switchStep("step-join");
document.getElementById("back-to-choice-btn").onclick = () => switchStep("step-choice");

// 3. Final Join
document.getElementById("join-btn").onclick = () => {
    const pin = document.getElementById("join-pin").value.trim();
    if (pin.length !== 6) return alert("6-digit PIN required.");
    roomCode = pin;
    localStorage.setItem("talk_roomCode", roomCode);
    connectToChat();
};
document.getElementById("start-created-btn").onclick = () => connectToChat();

// --- UPLOAD SYSTEM ---
const uploadFileToServer = async (file) => {
    if (!file || !roomCode || !clientId) return alert("No active room. Refresh.");

    addSystemMessage(`Uploading ${file.name}...`);
    
    try {
        const formData = new FormData();
        formData.append("file", file);

        const uploadUrl = `${window.location.origin}/upload?room_id=${roomCode}&sender=${clientId}`;

        const response = await fetch(uploadUrl, {
            method: "POST",
            body: formData,
            mode: 'cors'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Status: ${response.status}\n${errorText.substring(0, 30)}`);
        }
    } catch (err) {
        addSystemMessage(`Error: Could not upload ${file.name}.`);
        alert(`UPLOAD FAILED: ${err.message}`);
    }
};

document.getElementById("file-input").onchange = (e) => {
    if (e.target.files.length) uploadFileToServer(e.target.files[0]);
    e.target.value = "";
};

// Drag & Drop
const wrapper = document.querySelector(".chat-wrapper");
['dragenter', 'dragover'].forEach(n => wrapper.addEventListener(n, (e) => {
    e.preventDefault(); e.stopPropagation();
    wrapper.classList.add('drop-active');
}, false));
['dragleave', 'drop'].forEach(n => wrapper.addEventListener(n, (e) => {
    e.preventDefault(); e.stopPropagation();
    wrapper.classList.remove('drop-active');
    if (n === 'drop' && e.dataTransfer.files.length) [...e.dataTransfer.files].forEach(uploadFileToServer);
}, false));

function connectToChat() {
    document.getElementById("current-user").textContent = `Talk | ${clientId}`;
    document.getElementById("room-id-display").textContent = `PIN: ${roomCode}`;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomCode}/${clientId}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        document.getElementById("login-container").classList.add("hidden");
        document.getElementById("chat-container").classList.remove("hidden");
        addSystemMessage(`Joined Room ${roomCode}. Feel free to drop files here!`);
    };

    socket.onmessage = (event) => displayMessage(JSON.parse(event.data));
}

document.getElementById("message-form").onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById("message-input");
    if (input.value.trim() && socket?.readyState === WebSocket.OPEN) {
        socket.send(input.value);
        input.value = "";
    }
};

document.getElementById("logout-btn").onclick = () => {
    localStorage.clear();
    location.reload();
};

function getFileCategory(filename) {
    const ext = (filename || "").split('.').pop().toLowerCase();
    const images = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const videos = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const codes = ['html', 'css', 'js', 'py', 'java', 'cpp', 'php', 'json', 'ts', 'sh', 'sql'];
    if (images.includes(ext)) return 'image';
    if (videos.includes(ext)) return 'video';
    if (codes.includes(ext)) return 'code';
    return 'other';
}

function displayMessage(data) {
    const { sender, message, type, url } = data;
    const isSelf = sender === clientId;
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${isSelf ? 'self' : 'other'}`;
    
    const sSpan = document.createElement("span");
    sSpan.className = "sender-name";
    sSpan.textContent = isSelf ? "You" : sender;
    msgDiv.appendChild(sSpan);

    if (type === "file") {
        const cat = getFileCategory(message);
        const card = document.createElement("div");
        card.className = `file-card category-${cat}`;
        let preview = `<div class="${cat}-preview-container"><svg class="file-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></div>`;
        if (cat === 'image') preview = `<img src="${url}" class="file-preview image-preview" alt="img">`;
        
        card.innerHTML = `${preview}<div class="file-info-overlay"><span class="file-name" title="${message}">${message}</span><a href="${url}" download="${message}" class="download-btn-pill">Download</a></div>`;
        msgDiv.appendChild(card);
    } else {
        const tSpan = document.createElement("span");
        tSpan.className = "text";
        tSpan.textContent = message;
        msgDiv.appendChild(tSpan);
    }
    document.getElementById("messages").appendChild(msgDiv);
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
}

function addSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "system-message";
    div.textContent = text;
    document.getElementById("messages").appendChild(div);
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
}
