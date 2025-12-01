class LlmService {
  constructor() {
    this.status = "idle";
    this.progress = { text: "", progress: 0 };
    this.messages = [];
    this.settings = { temperature: 0.7, maxTokens: 512 };
    this.engine = null;
    this.isGenerating = false;
    this.isDarkTheme = false;

    this.statusTextEl = document.getElementById('status-text');
    this.progressBarEl = document.getElementById('progress-bar');
    this.loadBtn = document.getElementById('load-btn');
    this.sendBtn = document.getElementById('send-btn');
    this.chatInput = document.getElementById('chat-input');
    this.messagesContainer = document.getElementById('messages-container');
    this.errorContainer = document.getElementById('error-container');
    this.errorTextEl = document.getElementById('error-text');
    this.tempSlider = document.getElementById('temp-slider');
    this.tempValue = document.getElementById('temp-value');
    this.tokensInput = document.getElementById('tokens-input');
    this.tokensValue = document.getElementById('tokens-value');
    this.themeBtn = document.getElementById('theme-btn');

    this.initEventListeners();
    this.loadSettings();
    this.applyTheme();
    this.loadChatHistory();
  }

  initEventListeners() {
    this.loadBtn.addEventListener('click', () => this.initEngine());
    document.getElementById('reset-btn').addEventListener('click', () => this.resetApp());
    document.getElementById('clear-btn').addEventListener('click', () => this.clearChat());
    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
    this.chatInput.addEventListener('input', () => this.updateSendButtonState());

    this.tempSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      this.settings.temperature = value;
      this.tempValue.textContent = value.toFixed(2);
      this.saveSettings();
    });

    this.tokensInput.addEventListener('change', (e) => {
      let value = parseInt(e.target.value, 10);
      value = Math.max(64, Math.min(2048, value));
      this.settings.maxTokens = value;
      this.tokensValue.textContent = value;
      e.target.value = value;
      this.saveSettings();
    });

    this.themeBtn.addEventListener('click', () => this.toggleTheme());

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.chatInput.focus();
      }
    });
  }

  async initEngine() {
    if (this.status === "loading") return;

    this.setStatus("loading", "Vérification du support WebGPU...");
    this.setProgress("Vérification WebGPU...", 5);

    if (!this.isWebGPUSupported()) {
      this.setStatus("error", "WebGPU non disponible");
      this.showError("WebGPU n'est pas supporté par ce navigateur. Essaye Chrome, Edge ou un navigateur plus récent.");
      this.showToast("WebGPU non supporté", "Utilise Chrome ou Edge pour de meilleures performances", "warning");
      return;
    }

    try {
      await this.ensureWebllmLoaded();

      this.setStatus("loading", "Initialisation du moteur IA...");
      this.setProgress("Initialisation...", 25);

      const appConfig = {
        model_list: [
          {
            model: "https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC",
            model_id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
            model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-3B-Instruct-q4f16_1-ctx128k_cs1k-webgpu.wasm",
            required_features: ["shader-f16"],
          }
        ],
        useIndexedDBCache: false
      };

      const initProgressCallback = (report) => {
        const progress = Math.round(report.progress * 100);
        this.setProgress(report.text, 25 + progress * 0.75);
      };

      try {
        this.engine = await webllm.CreateMLCEngine(
          "Llama-3.2-3B-Instruct-q4f16_1-MLC",
          {
            appConfig,
            initProgressCallback,
            logLevel: "INFO"
          }
        );
      } catch (error) {
        const details = this.describeInitError(error);
        this.setStatus("error", "Erreur de chargement");
        this.showError(details);
        this.showToast("Erreur WebGPU", details, "error");
        return;
      }

      this.setProgress("Modèle prêt !", 100);
      this.setStatus("ready", "Modèle chargé et prêt");
      this.loadBtn.innerHTML = '<i class="fas fa-check"></i> Modèle prêt';
      this.loadBtn.disabled = true;
      this.chatInput.disabled = false;
      this.chatInput.placeholder = "Écris ton message...";
      this.updateSendButtonState();

      this.showToast("Modèle chargé", "L'IA locale est maintenant prête à discuter", "success");

      if (this.messages.length === 0) {
        this.addMessage(
          "assistant",
          "Salut ! Je suis Mon Gars, ton assistant IA local. Je fonctionne entièrement dans ton navigateur grâce à WebGPU. Aucune donnée ne quitte ton appareil ! Comment puis-je t'aider aujourd'hui ?"
        );
      }

    } catch (error) {
      console.error("Error initializing engine:", error);
      const details = this.describeInitError(error);
      this.setStatus("error", "Erreur de chargement");
      this.showError(details);
      this.showToast("Erreur de chargement", details, "error");
    }
  }

  async ensureWebllmLoaded() {
    if (typeof webllm !== 'undefined') return;

    this.setStatus("loading", "Chargement de WebLLM...");
    this.setProgress("Chargement de la bibliothèque...", 10);

    await this.loadScript('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/dist/webllm.js');

    this.setProgress("Bibliothèque chargée", 20);
    await this.delay(500);
  }

  loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Échec du chargement du script WebLLM"));
      document.head.appendChild(script);
    });
  }

  isWebGPUSupported() {
    return typeof navigator !== "undefined" && navigator.gpu !== undefined;
  }

  async handleSend() {
    const input = this.chatInput.value.trim();
    if (!input || this.status !== "ready" || this.isGenerating) return;

    this.chatInput.value = '';
    this.updateSendButtonState();
    this.addMessage("user", input);

    const assistantId = 'msg-' + Date.now();
    this.addMessage("assistant", "", assistantId);
    this.isGenerating = true;
    this.sendBtn.disabled = true;
    this.sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération...';

    try {
      const recentMessages = this.messages.slice(-20);

      const messages = [
        {
          role: 'system',
          content: "Tu es Mon Gars, un assistant IA utile et sympathique qui fonctionne localement dans le navigateur de l'utilisateur. Sois concis, intelligent et utile. Réponds en français de manière naturelle."
        },
        ...recentMessages
          .filter(msg => msg.role !== 'system')
          .map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          }))
      ];

      const completion = await this.engine.chat.completions.create({
        messages,
        stream: false,
        temperature: this.settings.temperature,
        max_tokens: this.settings.maxTokens
      });

      const response =
        (completion &&
          completion.choices &&
          completion.choices[0] &&
          completion.choices[0].message &&
          completion.choices[0].message.content) ||
        "Je n'ai pas pu générer de réponse. Peux-tu reformuler ta question ?";

      this.updateMessage(assistantId, response);

    } catch (error) {
      console.error("Error generating response:", error);
      this.updateMessage(
        assistantId,
        "Désolé, une erreur s'est produite lors de la génération de ma réponse. Peux-tu réessayer ?"
      );
      this.showToast("Erreur de génération", "Réessaie dans un moment", "error");
    } finally {
      this.isGenerating = false;
      this.sendBtn.disabled = false;
      this.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Envoyer';
    }
  }

  addMessage(role, content, id = 'msg-' + Date.now()) {
    const message = { id, role, content, timestamp: new Date() };
    this.messages.push(message);
    this.renderMessage(message);
    this.saveChatHistory();
  }

  updateMessage(id, content) {
    const message = this.messages.find(msg => msg.id === id);
    if (message) {
      message.content = content;
      this.renderMessage(message, true);
      this.saveChatHistory();
    }
  }

  renderMessage(message, update = false) {
    if (update) {
      const existingEl = document.getElementById(message.id);
      if (existingEl) {
        const contentEl = existingEl.querySelector('.message-content');
        contentEl.textContent = message.content;
        return;
      }
    }

    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.role}-message`;
    messageEl.id = message.id;

    const now = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const headerEl = document.createElement('div');
    headerEl.className = 'message-header';

    const authorEl = document.createElement('span');
    authorEl.textContent = message.role === 'user' ? 'Toi' : 'Mon Gars';

    const timeEl = document.createElement('span');
    timeEl.textContent = timeStr;

    headerEl.append(authorEl, timeEl);

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = message.content;

    const actionsEl = document.createElement('div');
    actionsEl.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn copy-btn';
    copyBtn.title = 'Copier le message';
    const copyIcon = document.createElement('i');
    copyIcon.className = 'fas fa-copy';
    copyBtn.appendChild(copyIcon);
    actionsEl.appendChild(copyBtn);

    if (message.role === 'user') {
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn edit-btn';
      editBtn.title = 'Rééditer ce message';
      const editIcon = document.createElement('i');
      editIcon.className = 'fas fa-edit';
      editBtn.appendChild(editIcon);
      actionsEl.appendChild(editBtn);

      editBtn.addEventListener('click', () => {
        this.chatInput.value = message.content;
        this.chatInput.focus();
        this.updateSendButtonState();
      });
    }

    messageEl.append(headerEl, contentEl, actionsEl);

    copyBtn.addEventListener('click', () => this.handleCopy(message.content));

    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  async handleCopy(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      this.showToast("Copie impossible", "Le presse-papiers n'est pas accessible dans ce contexte", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      this.showToast("Message copié", "Le message a été copié dans le presse-papier", "success");
    } catch (error) {
      console.error("Clipboard error:", error);
      this.showToast("Copie refusée", "Impossible de copier le message. Vérifie les permissions du navigateur.", "error");
    }
  }

  clearChat(force = false) {
    if (force || confirm("Effacer toute la conversation ? Cette action ne peut pas être annulée.")) {
      this.messages = [];
      this.messagesContainer.innerHTML = `
        <div class="welcome-card">
          <div class="welcome-icon">
            <i class="fas fa-microchip"></i>
          </div>
          Conversation effacée. Tape un nouveau message pour recommencer !
        </div>
      `;
      this.saveChatHistory();
      if (!force) {
        this.showToast("Conversation effacée", "La conversation a été supprimée", "success");
      }
    }
  }

  resetApp() {
    if (confirm("Réinitialiser complètement l'application ? Cela effacera la conversation et déchargera le modèle.")) {
      if (this.engine && typeof this.engine.unload === "function") {
        try {
          this.engine.unload();
        } catch (e) {
          console.warn("Erreur lors du déchargement du modèle:", e);
        }
      }
      this.engine = null;
      this.status = "idle";
      this.isGenerating = false;
      this.setProgress("", 0);
      this.setStatus("idle", "En attente de chargement");
      this.loadBtn.innerHTML = '<i class="fas fa-download"></i> Charger le modèle';
      this.loadBtn.disabled = false;
      this.chatInput.disabled = true;
      this.chatInput.placeholder = "Charge le modèle avant de discuter...";
      this.sendBtn.disabled = true;
      this.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Envoyer';
      this.clearChat(true);
    }
  }

  showError(message) {
    this.errorTextEl.textContent = message;
    this.errorContainer.style.display = 'flex';
    setTimeout(() => {
      this.errorContainer.style.display = 'none';
    }, 8000);
  }

  showToast(title, message, type = "info") {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'toast-icon';
    const icon = document.createElement('i');
    icon.className =
      type === "success"
        ? 'fas fa-check-circle'
        : type === "error"
          ? 'fas fa-exclamation-circle'
          : 'fas fa-info-circle';
    iconWrapper.appendChild(icon);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'toast-content';
    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;
    const messageEl = document.createElement('div');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;
    contentWrapper.append(titleEl, messageEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    const closeIcon = document.createElement('i');
    closeIcon.className = 'fas fa-times';
    closeBtn.appendChild(closeIcon);

    toast.append(iconWrapper, contentWrapper, closeBtn);
    document.body.appendChild(toast);

    const closeToast = () => {
      if (!toast.parentNode) return;
      toast.classList.remove('show');
      setTimeout(() => toast.parentNode && toast.parentNode.removeChild(toast), 300);
    };

    setTimeout(() => toast.classList.add('show'), 10);
    closeBtn.addEventListener('click', closeToast);

    setTimeout(closeToast, 5000);
  }

  setStatus(status, text) {
    this.status = status;
    this.statusTextEl.textContent = text;

    if (status === 'error') {
      this.progressBarEl.classList.add('progress-error');
    } else {
      this.progressBarEl.classList.remove('progress-error');
    }
  }

  setProgress(text, progress) {
    this.progress = { text, progress };
    const clamped = Math.min(100, Math.max(0, progress));
    this.progressBarEl.style.width = `${clamped}%`;
    if (text) {
      this.statusTextEl.textContent = text;
    }
  }

  updateSendButtonState() {
    const input = this.chatInput.value.trim();
    this.sendBtn.disabled = !input || this.status !== "ready" || this.isGenerating;
  }

  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    this.applyTheme();
    this.saveSettings();
  }

  applyTheme() {
    if (this.isDarkTheme) {
      document.documentElement.setAttribute('data-theme', 'dark');
      this.themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
      this.themeBtn.title = "Passer en mode clair";
    } else {
      document.documentElement.removeAttribute('data-theme');
      this.themeBtn.innerHTML = '<i class="fas fa-moon"></i>';
      this.themeBtn.title = "Passer en mode sombre";
    }
  }

  saveSettings() {
    try {
      const settings = {
        temperature: this.settings.temperature,
        maxTokens: this.settings.maxTokens,
        isDarkTheme: this.isDarkTheme
      };
      localStorage.setItem('monGarsSettings', JSON.stringify(settings));
    } catch (e) {
      console.warn("Could not save settings:", e);
    }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem('monGarsSettings');
      if (!raw) return;
      const settings = JSON.parse(raw);
      if (settings.temperature !== undefined) {
        this.settings.temperature = settings.temperature;
        this.tempSlider.value = Math.round(settings.temperature * 100);
        this.tempValue.textContent = settings.temperature.toFixed(2);
      }
      if (settings.maxTokens !== undefined) {
        this.settings.maxTokens = settings.maxTokens;
        this.tokensInput.value = settings.maxTokens;
        this.tokensValue.textContent = settings.maxTokens;
      }
      if (settings.isDarkTheme !== undefined) {
        this.isDarkTheme = settings.isDarkTheme;
      }
    } catch (e) {
      console.warn("Could not load settings:", e);
    }
  }

  saveChatHistory() {
    try {
      localStorage.setItem('monGarsChatHistory', JSON.stringify(this.messages));
    } catch (e) {
      console.warn("Could not save chat history:", e);
    }
  }

  loadChatHistory() {
    try {
      const raw = localStorage.getItem('monGarsChatHistory');
      if (!raw) return;
      const history = JSON.parse(raw);
      if (Array.isArray(history) && history.length > 0) {
        this.messages = history.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));

        this.messagesContainer.innerHTML = '';
        this.messages.forEach(msg => this.renderMessage(msg));

        if (this.messages.length > 0) {
          this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
      }
    } catch (e) {
      console.warn("Could not load chat history:", e);
    }
  }

  describeInitError(error) {
    const message = error && error.message ? error.message.toLowerCase() : '';
    if (message.includes('shader-f16')) {
      return "Votre appareil supporte WebGPU mais ne propose pas la fonctionnalité 'shader-f16'. Essayez un navigateur ou un GPU plus récent.";
    }
    if (message.includes('adapter') || message.includes('device')) {
      return "WebGPU est disponible mais l'initialisation du GPU a échoué. Vérifie les pilotes/paramètres graphiques.";
    }
    return error && error.message
      ? `Erreur lors de l'initialisation : ${error.message}`
      : "Erreur inconnue lors de l'initialisation du modèle.";
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

}

document.addEventListener('DOMContentLoaded', () => {
  new LlmService();
});
