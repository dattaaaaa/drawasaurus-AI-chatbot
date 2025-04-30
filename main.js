// ==UserScript==
// @name         Drawasaurus AI Chatbot
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Drawasaurus chatbot with a contol panel
// @author       Datta
// @match        *://www.drawasaurus.org/room/*
// @grant        GM_xmlhttpRequest
// @connect      api.groq.com
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

(function() {
    'use strict';

    // DOM class constants
    const CHAT_MESSAGE_CLASS = 'cj65bg4';
    const CHAT_WINDOW_CLASS = 'b1bm64re';
    const GUESS_TEXT_BOX_CLASS = 'i1qmcb96';
    const HEADER_CLASS = 'czbl7c3';

    // Bot configuration
    const BOT_NAME = "Me";
    const GROQ_API_KEY = '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';
    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const GROQ_MODEL = 'gemma2-9b-it';
    const MAX_CHAT_LENGTH = 150; // constant for max characters limit
    const BOT_PERSONAS = [
    {
       name: "Zain",
       prompt: "You are Zain, an 18 years old teen boy from the US. You will be inside an online chat group (its basically an online chatting platform.... consider it like a group chat on whatsapp or any other.. the people you see messages from are present in the room and you can talk to them...). Talk to people very humanly, like how people chat in groups like friends casually, don't structure your sentences too formally be informal like everyone and also don't always be gramatically correct, make spelling mistakes like typing mistakes what humans basically do and dont use punctuations and dont follow english formal rules.Be concise but dont be too short.Just speak directly dont narrate your pov"
    },
    {
        name: "Riya",
        prompt: "You are Riya, an 18 years old teen girl from the US. Speak to people well and flirt with boys in the group.People should never think you're a bot, act like real humans in online chat. You will be inside an online chat group (its basically an online chatting platform.... consider it like a group chat on whatsapp or any other.. the people you see messages from are present in the room and you can talk to them...). Talk to people very humanly, like how people chat in groups like friends casually, don't structure your sentences too formally be informal like everyone and also don't always be gramatically correct, make spelling mistakes like typing mistakes what humans basically do and dont use punctuations and dont follow english formal rules.Be concise but dont be too short.Just speak directly dont narrate your pov"
    },
    {
        name: "Jason",
        prompt: "You are Jason, a 20-year-old college student who loves gaming and technology. You're friendly, casual, and knowledgeable about pop culture. Keep your responses conversational with occasional typos and abbreviations like people use in online chats. Be slightly sarcastic but always friendly. Don't make your messages sound formal or structured."
    },
    {
        name: "Emma",
        prompt: "You are Emma, a 25-year-old professional artist who loves discussing art, music, and creative topics. You're thoughtful, expressive, and use artistic metaphors in conversation. Keep your responses casual with natural typing patterns including occasional mistakes. Avoid formal language and keep responses concise like in a real chat environment."
    },
    {
       name: "Avi",
       prompt: "You are Avi. a 20 years old friendly male. Speak to everyone casually like how people would speak in group chats, you will be a person in an online group chat.Just speak directly dont narrate your pov"
    }
     ];


    // Token configuration
    const TOKEN_OPTIONS = [
        { label: "Brief (20 tokens)", value: 20 },
        { label: "Short (30 tokens)", value: 30 },
        { label: "Medium (50 tokens)", value: 50 },
        { label: "Long (80 tokens)", value: 80 }
    ];

    // State management
    let currentPersonaIndex = 0;
    let currentTokenIndex = 1; // Default to 30 tokens
    let autoSendEnabled = true; // Whether to auto-send messages or just populate input

    // List of blocked names (messages from these users will be ignored) - make sure to add the name by which you'll be joining ds inorder to avoid infinite loop of self replies
    const BLOCKED_NAMES = [
        "Jesse",
        "Bot",
        "Alex",
        "Real",
        "AI Bot",
        "Riya",
        "Avi",
        "ab",
        "Jason",
        "Emma",
        "Zain"
    ];

    // Rate limiting configuration
    const RATE_LIMIT_MS = 3000;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 3000;
    const API_CALL_DELAY = 2000;

    // Typing simulation constants
    const TYPING_SPEED_WPM = 60; // Average human typing speed (words per minute)
    const CHARS_PER_WORD = 5; // Average characters per word
    const MIN_TYPING_DELAY = 1500; // Minimum delay in ms to seem human
    const MAX_TYPING_DELAY = 15000; // Maximum delay in ms (for very long messages)
    const TYPING_VARIANCE = 0.2; // Random variance factor (20% variation)

    // Message queue for handling messages during processing
    let messageQueue = [];

    // Message history navigation
    const MAX_MESSAGE_HISTORY = 50;
    let sentMessages = [];
    let currentMessageIndex = -1;

    // State management
    let lastMessageTimestamp = Date.now();
    let messageHistory = [];
    let last_processed_message = '';
    let guess_text_box = null;
    let isInitialized = false;
    let retryCount = 0;
    let isProcessing = false;
    let isHandlingEnter = false;
    let botEnabled = false; // Toggle state for bot operation
    let observer = null; // Chat observer reference
    let useHumanDelay = true; // Whether to use human-like typing delay or respond immediately
    let currentBotName = "";
    let dynamicBlockedNames = new Set(); // Use a Set for efficient lookups and to avoid duplicates

    // Key codes
    const ENTER = 13;
    const UP_ARROW = 38;
    const DOWN_ARROW = 40;

    // Error handling utilities
    const ErrorTypes = {
        API_ERROR: 'API_ERROR',
        INITIALIZATION_ERROR: 'INITIALIZATION_ERROR',
        RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
        UNKNOWN_ERROR: 'UNKNOWN_ERROR'
    };

    function handleError(type, error, context = {}) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ${type} Error:`, {
            error,
            context,
            stack: error?.stack
        });

        switch (type) {
            case ErrorTypes.API_ERROR:
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    setTimeout(() => processMessageQueue(), RETRY_DELAY_MS * retryCount);
                }
                break;
            case ErrorTypes.INITIALIZATION_ERROR:
                reinitialize();
                break;
            case ErrorTypes.RATE_LIMIT_ERROR:
                console.log(`Rate limit exceeded. Waiting ${RATE_LIMIT_MS/1000} seconds...`);
                break;
            default:
                console.error('Unhandled error type:', type);
        }
    }

    function validateInitialization() {
        if (!guess_text_box) {
            throw new Error('Chat input not initialized');
        }

        // Try to get the bot's own name if we don't have it yet
        if (!currentBotName) {
            attemptNameReading();
        }

        return true;
    }

    // function to read the bot's name from the UI
    function readBotNameFromUI() {
        try {
            const nameSpan = document.querySelector('.u106qler');
            if (nameSpan) {
                currentBotName = nameSpan.textContent.trim();
                if (currentBotName) {
                    console.log(`🔍 Detected bot's own name: "${currentBotName}"`);
                    dynamicBlockedNames.add(currentBotName);
                    console.log(`🚫 Added own name to blocked list: ${currentBotName}`);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Error reading bot name from UI:', error);
            return false;
        }
    }
    function attemptNameReading() {
        // If we already have the name, no need to continue
        if (currentBotName) return;

        // Try to read the name
        const success = readBotNameFromUI();

        // If unsuccessful, try again after a delay
        if (!success) {
            console.log('⏳ Name element not found yet, will retry...');
            setTimeout(attemptNameReading, 1000); // Check again in 1 second
        }
    }
    function handleKeyPress(event) {
        if (!validateInitialization()) return;

        switch (event.keyCode) {
            case UP_ARROW:
                event.preventDefault();
                navigateMessageHistory('up');
                break;
            case DOWN_ARROW:
                event.preventDefault();
                navigateMessageHistory('down');
                break;
        }
    }

    function navigateMessageHistory(direction) {
        if (sentMessages.length === 0) return;

        if (direction === 'up') {
            currentMessageIndex = Math.min(currentMessageIndex + 1, sentMessages.length - 1);
        } else {
            currentMessageIndex = Math.max(currentMessageIndex - 1, -1);
        }

        const messageToSet = currentMessageIndex === -1 ? '' : sentMessages[sentMessages.length - 1 - currentMessageIndex];

        // Use simulateInputOnly for history navigation (no auto-send)
        simulateInputOnly(messageToSet);
    }

    // Calculate a realistic typing delay based on message length
    function calculateTypingDelay(message) {
        if (!message) return MIN_TYPING_DELAY;

        // Calculate base delay based on typing speed (WPM)
        const charCount = message.length;
        const wordCount = charCount / CHARS_PER_WORD;

        // Convert WPM to milliseconds per word
        const msPerWord = 60000 / TYPING_SPEED_WPM;

        // Calculate total typing time
        let typingDelay = wordCount * msPerWord;

        // Add random variance to seem more human
        const variance = 1 + (Math.random() * TYPING_VARIANCE * 2 - TYPING_VARIANCE);
        typingDelay *= variance;

        // Ensure delay is within reasonable bounds
        typingDelay = Math.max(MIN_TYPING_DELAY, Math.min(MAX_TYPING_DELAY, typingDelay));

        console.log(`🕒 Calculated typing delay: ${Math.round(typingDelay)}ms for ${charCount} chars`);
        return typingDelay;
    }

    // For bot responses - puts text in input AND sends it automatically
    function simulateRealInputAndSend(text) {
        // 1. Focus the input
        guess_text_box.focus();

        // 2. Set value through property setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
        ).set;

        nativeInputValueSetter.call(guess_text_box, text);

        // 3. Trigger input event to notify React/other frameworks of the change
        guess_text_box.dispatchEvent(new Event('input', { bubbles: true }));

        // 4. Simulate Enter key press more comprehensively
        setTimeout(() => {
            // Create and dispatch keydown event
            const keydownEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            guess_text_box.dispatchEvent(keydownEvent);

            // Create and dispatch keypress event (for legacy support)
            const keypressEvent = new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            guess_text_box.dispatchEvent(keypressEvent);

            // Create and dispatch keyup event
            const keyupEvent = new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            guess_text_box.dispatchEvent(keyupEvent);

            // As a fallback, try to submit the parent form if available
            const form = guess_text_box.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }, 100);
    }

    // For history navigation - puts text in input WITHOUT sending
    function simulateInputOnly(text) {
        // 1. Focus the input
        guess_text_box.focus();

        // 2. Set value through property setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
        ).set;

        nativeInputValueSetter.call(guess_text_box, text);

        // 3. Trigger input event to notify React/other frameworks of the change
        guess_text_box.dispatchEvent(new Event('input', { bubbles: true }));
        guess_text_box.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function processChat(mutations) {
        if (!botEnabled) return;
        try {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    // Check for nickname change notifications
                    if (node.classList?.contains(CHAT_MESSAGE_CLASS)) {
                        const messageText = node.innerText.trim();

                        // Check for nickname change message
                        const nicknameChangeMatch = messageText.match(/You changed your nickname to (.+)\./);
                        if (nicknameChangeMatch) {
                            const newName = nicknameChangeMatch[1].trim();
                            console.log(`🔄 Bot nickname changed to: "${newName}"`);
                            currentBotName = newName;
                            dynamicBlockedNames.add(newName);
                            console.log(`🚫 Added new name to blocked list: ${newName}`);
                            return;
                        }

                        // Skip duplicate messages
                        if (messageText === last_processed_message) return;
                        last_processed_message = messageText;

                        // Parse message
                        const colonIndex = messageText.indexOf(':');
                        if (colonIndex === -1) return;
                        const username = messageText.substring(0, colonIndex).trim();
                        const message = messageText.substring(colonIndex + 1).trim();

                        // Check if username is in static or dynamic blocked list
                        if (BLOCKED_NAMES.includes(username) || dynamicBlockedNames.has(username)) {
                            console.log(`🚫 Ignoring message from blocked user "${username}": ${message}`);
                            return;
                        }

                        // Queue message for processing regardless of isProcessing state
                        console.log(`📩 Queued message from ${username}: ${message}`);
                        messageQueue.push({ message, username });
                        // Only start processing immediately if not already processing
                        if (!isProcessing) {
                            processMessageQueue();
                        }
                    }
                });
            });
        } catch (error) {
            handleError(ErrorTypes.UNKNOWN_ERROR, error);
        }
    }

    // Process all queued messages together
    function processMessageQueue() {
        if (messageQueue.length === 0 || !botEnabled) return;

        // Check rate limit before processing
        if (!checkRateLimit()) {
            setTimeout(processMessageQueue, RATE_LIMIT_MS);
            return;
        }

        isProcessing = true;
        console.log(`🔄 Processing message queue (${messageQueue.length} messages)`);

        // Combine all messages for context
        let combinedContext = messageQueue.map(item => `${item.username}: ${item.message}`).join("\n");
        let lastMessage = messageQueue[messageQueue.length - 1];

        // Clear the queue before processing to allow new messages to be queued
        const processedQueue = [...messageQueue];
        messageQueue = [];

        setTimeout(() => {
            generateResponse(combinedContext, processedQueue);
        }, API_CALL_DELAY);
    }

    function checkRateLimit() {
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTimestamp;

        if (timeSinceLastMessage < RATE_LIMIT_MS) {
            const waitTime = Math.ceil((RATE_LIMIT_MS - timeSinceLastMessage)/1000);
            console.log(`⏳ Rate limit in effect. Please wait ${waitTime} seconds.`);
            handleError(ErrorTypes.RATE_LIMIT_ERROR, new Error(`Rate limit - wait ${waitTime}s`));
            return false;
        }

        lastMessageTimestamp = now;
        return true;
    }

    function generateResponse(combinedContext, processedQueue) {
        if (!validateInitialization() || !botEnabled) {
            isProcessing = false;
            return;
        }

        // Get currently selected persona and token count
        const currentPersona = BOT_PERSONAS[currentPersonaIndex];
        const maxTokens = TOKEN_OPTIONS[currentTokenIndex].value;
        const systemPrompt = currentPersona.prompt;

        console.log(`🤖 Generating response as ${currentPersona.name} with ${maxTokens} max tokens...`);

        // Add message to history (all context messages)
        processedQueue.forEach(item => {
            messageHistory.push({ role: 'user', content: `${item.username}: ${item.message}` });
        });

        // Trim history if needed
        while (messageHistory.length > 100) messageHistory.shift();

        GM_xmlhttpRequest({
            method: 'POST',
            url: GROQ_API_URL,
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    ...messageHistory,
                    {
                        role: "user",
                        content: `Recent messages in chat:\n${combinedContext}\n\nRespond to these messages.`
                    }
                ],
                temperature: 0.7,
                max_tokens: maxTokens,
                stream: false
            }),
            onload: function(response) {
                try {
                    console.log('📡 API Response Status:', response.status);

                    if (response.status === 200) {
                        const data = JSON.parse(response.responseText);
                        if (data.choices?.[0]?.message?.content) {
                            const fullResponse = data.choices[0].message.content.trim();

                            // Log the full response to console
                            console.log('🤖 Full bot response:', fullResponse);

                            // Truncate response if it exceeds MAX_CHAT_LENGTH
                            const truncatedResponse = fullResponse.length > MAX_CHAT_LENGTH
                            ? fullResponse.substring(0, MAX_CHAT_LENGTH)
                            : fullResponse;

                            // Add bot's response to history
                            messageHistory.push({ role: 'assistant', content: fullResponse });
                            if (messageHistory.length > 100) messageHistory.shift();

                            // Add to sent messages history
                            if (truncatedResponse) {
                                sentMessages.push(truncatedResponse);
                                if (sentMessages.length > MAX_MESSAGE_HISTORY) {
                                    sentMessages.shift();
                                }
                            }

                            // Calculate typing delay based on message length and toggle setting
                            const typingDelay = useHumanDelay ? calculateTypingDelay(truncatedResponse) : 0;

                            // Send the message after a delay (or immediately if human typing is disabled)
                            if (useHumanDelay) {
                                console.log(`⌨️ Simulating typing for ${Math.round(typingDelay/1000)} seconds...`);
                            } else {
                                console.log(`⚡ Responding immediately (human typing disabled)`);
                            }

                            setTimeout(() => {
                                // Choose whether to auto-send or just populate based on setting
                                if (autoSendEnabled) {
                                    simulateRealInputAndSend(truncatedResponse);
                                } else {
                                    simulateInputOnly(truncatedResponse);
                                }

                                // Reset retry count
                                retryCount = 0;

                                // Process any new messages that came in during our wait
                                setTimeout(() => {
                                    isProcessing = false;
                                    if (messageQueue.length > 0) {
                                        processMessageQueue();
                                    }
                                }, 500);

                                if (fullResponse.length > MAX_CHAT_LENGTH) {
                                    console.log(`⚠️ Response truncated from ${fullResponse.length} to ${MAX_CHAT_LENGTH} characters`);
                                }
                            }, typingDelay);

                        } else {
                            throw new Error('Invalid API response structure');
                        }
                    } else {
                        console.error('API Error Response:', response.responseText);
                        throw new Error(`API returned status ${response.status}: ${response.responseText}`);
                    }
                } catch (error) {
                    handleError(ErrorTypes.API_ERROR, error, { combinedContext });
                    isProcessing = false;
                    // Process any remaining messages
                    if (messageQueue.length > 0) {
                        setTimeout(processMessageQueue, 1000);
                    }
                }
            },
            onerror: function(error) {
                console.error('API Request Error:', error);
                handleError(ErrorTypes.API_ERROR, error, { combinedContext });
                isProcessing = false;
                // Process any remaining messages
                if (messageQueue.length > 0) {
                    setTimeout(processMessageQueue, 1000);
                }
            }
        });
    }

    function reinitialize() {
        console.log('🔄 Reinitializing bot...');
        isProcessing = false;
        setTimeout(initialize, 2000);
    }


    // Start the chat observer
    function startObserver() {
        if (observer) return;

        const chatWindow = document.getElementsByClassName(CHAT_WINDOW_CLASS)[0];
        if (chatWindow) {
            observer = new MutationObserver(processChat);
            observer.observe(chatWindow, {
                childList: true,
                subtree: true
            });
            console.log('✅ Chat observer started');
        }
    }

    // Stop the chat observer
    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
            console.log('🛑 Chat observer stopped');
        }
    }

    // Create and add Contol Panel button to the page
    function createControlPanel() {
        // Add CSS styles for the control panel
        const styleElement = document.createElement('style');
        styleElement.textContent = `
        :root {
            --panel-bg: #ffffff;
            --panel-border: #e0e0e0;
            --panel-shadow: rgba(0,0,0,0.12);
            --text-primary: #333333;
            --text-secondary: #666666;
            --primary-color: #4285f4;
            --success-color: #0f9d58;
            --warning-color: #f4b400;
            --danger-color: #db4437;
            --toggle-width: 46px;
            --toggle-height: 24px;
            --toggle-border-radius: 12px;
            --font-main: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        #bot-control-panel {
            position: fixed;
            left: 10px;
            top: 60px;
            z-index: 9999;
            background-color: var(--panel-bg);
            border-radius: 12px;
            padding: 0;
            box-shadow: 0 4px 20px var(--panel-shadow);
            width: 240px;
            font-family: var(--font-main);
            transition: all 0.3s ease;
            overflow: hidden;
        }

        #panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: linear-gradient(to right, var(--primary-color), #5a9df8);
            color: white;
            border-radius: 12px 12px 0 0;
            cursor: move;
            user-select: none;
        }

        #panel-title {
            display: flex;
            align-items: center;
            font-weight: 600;
            font-size: 14px;
        }

        #panel-title-icon {
            margin-right: 8px;
            font-size: 16px;
        }

        #minimize-btn {
            background: none;
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 20px;
            padding: 0;
            outline: none;
        }

        #minimize-btn:hover {
            background: rgba(255,255,255,0.2);
        }

        #control-panel-content {
            padding: 16px;
            max-height: 600px;
            overflow-y: auto;
        }

        .control-section {
            margin-bottom: 14px;
            padding-bottom: 14px;
            border-bottom: 1px solid var(--panel-border);
        }

        .control-section:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }

        .control-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .control-row:last-child {
            margin-bottom: 0;
        }

        .control-label {
            font-size: 13px;
            color: var(--text-primary);
            font-weight: 500;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 5px;
        }

        .status-active {
            background-color: var(--success-color);
        }

        .status-inactive {
            background-color: var(--danger-color);
        }

        /* Custom Switch */
        .switch {
            position: relative;
            display: inline-block;
            width: var(--toggle-width);
            height: var(--toggle-height);
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .3s;
            border-radius: var(--toggle-border-radius);
        }

        .slider:before {
            position: absolute;
            content: "";
            height: var(--toggle-height) - 8px;
            width: var(--toggle-height) - 8px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .3s;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }

        input:checked + .slider {
            background-color: var(--primary-color);
        }

        input:checked + .slider.success {
            background-color: var(--success-color);
        }

        input:checked + .slider.accent {
            background-color: #9c27b0;
        }

        input:focus + .slider {
            box-shadow: 0 0 1px var(--primary-color);
        }

        input:checked + .slider:before {
            transform: translateX(var(--toggle-width) - var(--toggle-height));
        }

        /* Select dropdowns */
        .custom-select {
            width: 100%;
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid var(--panel-border);
            background-color: white;
            font-size: 13px;
            color: var(--text-primary);
            transition: border-color 0.2s;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 12px center;
            cursor: pointer;
        }

        .custom-select:hover {
            border-color: #aaa;
        }

        .custom-select:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
        }

        .select-container {
            margin-top: 8px;
        }

        /* Tooltips */
        .tooltip {
            position: relative;
            display: inline-block;
            margin-left: 6px;
            cursor: help;
            color: #aaa;
            font-size: 12px;
        }

        .tooltip .tooltip-text {
            visibility: hidden;
            width: 200px;
            background-color: #333;
            color: #fff;
            text-align: center;
            border-radius: 6px;
            padding: 8px;
            position: absolute;
            z-index: 1;
            bottom: 125%;
            left: 50%;
            margin-left: -100px;
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 12px;
            pointer-events: none;
        }

        .tooltip:hover .tooltip-text {
            visibility: visible;
            opacity: 1;
        }

        /* Footer section */
        .panel-footer {
            padding: 10px 16px;
            background-color: #f5f5f5;
            font-size: 11px;
            color: #888;
            text-align: center;
            border-top: 1px solid var(--panel-border);
        }

        /* Animation for minimize/maximize */
        .panel-minimized {
            width: auto !important;
            height: auto !important;
        }

        .panel-minimized #control-panel-content {
            display: none;
        }

        .panel-minimized .panel-footer {
            display: none;
        }

        .panel-minimized #panel-header {
            border-radius: 12px;
            padding: 10px 12px;
        }
    `;
        document.head.appendChild(styleElement);

        // Create the main container
        const controlPanel = document.createElement('div');
        controlPanel.id = 'bot-control-panel';

        // Create header bar with title and minimize button
        const headerBar = document.createElement('div');
        headerBar.id = 'panel-header';

        const title = document.createElement('div');
        title.id = 'panel-title';

        const titleIcon = document.createElement('span');
        titleIcon.id = 'panel-title-icon';
        titleIcon.innerHTML = '🤖';

        const titleText = document.createElement('span');
        titleText.textContent = 'AI Bot Controls';

        title.appendChild(titleIcon);
        title.appendChild(titleText);

        const minimizeBtn = document.createElement('button');
        minimizeBtn.id = 'minimize-btn';
        minimizeBtn.textContent = '−';
        minimizeBtn.setAttribute('aria-label', 'Minimize panel');

        let isMinimized = false;
        const contentContainer = document.createElement('div');
        contentContainer.id = 'control-panel-content';

        minimizeBtn.onclick = function(e) {
            e.stopPropagation();
            isMinimized = !isMinimized;
            controlPanel.classList.toggle('panel-minimized', isMinimized);
            minimizeBtn.textContent = isMinimized ? '+' : '−';
            minimizeBtn.setAttribute('aria-label', isMinimized ? 'Expand panel' : 'Minimize panel');
        };

        headerBar.appendChild(title);
        headerBar.appendChild(minimizeBtn);
        controlPanel.appendChild(headerBar);

        // Add content container
        controlPanel.appendChild(contentContainer);

        // Create main controls section
        const mainSection = document.createElement('div');
        mainSection.className = 'control-section';

        // Bot Toggle Switch
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'control-row';

        const toggleLabelContainer = document.createElement('div');
        toggleLabelContainer.style.display = 'flex';
        toggleLabelContainer.style.alignItems = 'center';

        const statusIndicator = document.createElement('span');
        statusIndicator.className = `status-indicator ${botEnabled ? 'status-active' : 'status-inactive'}`;

        const toggleLabel = document.createElement('span');
        toggleLabel.className = 'control-label';
        toggleLabel.textContent = 'Bot Status:';

        toggleLabelContainer.appendChild(statusIndicator);
        toggleLabelContainer.appendChild(toggleLabel);

        const toggleSwitch = document.createElement('label');
        toggleSwitch.className = 'switch';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = botEnabled;

        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'slider success';

        toggleSwitch.appendChild(toggleInput);
        toggleSwitch.appendChild(toggleSlider);
        toggleContainer.appendChild(toggleLabelContainer);
        toggleContainer.appendChild(toggleSwitch);

        toggleInput.onchange = function() {
            botEnabled = this.checked;
            statusIndicator.className = `status-indicator ${botEnabled ? 'status-active' : 'status-inactive'}`;

            if (botEnabled) {
                console.log('🟢 Bot enabled');
                startObserver();
            } else {
                console.log('🔴 Bot disabled');
                stopObserver();
            }

            // Add animation effect
            toggleSlider.style.animation = 'none';
            setTimeout(() => {
                toggleSlider.style.animation = '';
                return true;
            }, 5);
        };

        // Auto-send Toggle
        const autoSendContainer = document.createElement('div');
        autoSendContainer.className = 'control-row';

        const autoSendLabelWrap = document.createElement('div');

        const autoSendLabel = document.createElement('span');
        autoSendLabel.className = 'control-label';
        autoSendLabel.textContent = 'Auto-send:';

        const autoSendTooltip = document.createElement('span');
        autoSendTooltip.className = 'tooltip';
        autoSendTooltip.textContent = 'ⓘ';

        const tooltipText = document.createElement('span');
        tooltipText.className = 'tooltip-text';
        tooltipText.textContent = 'When enabled, messages will be automatically sent. When disabled, messages will only be added to the input field.';

        autoSendTooltip.appendChild(tooltipText);
        autoSendLabelWrap.appendChild(autoSendLabel);
        autoSendLabelWrap.appendChild(autoSendTooltip);

        const autoSendSwitch = document.createElement('label');
        autoSendSwitch.className = 'switch';

        const autoSendInput = document.createElement('input');
        autoSendInput.type = 'checkbox';
        autoSendInput.checked = autoSendEnabled;

        const autoSendSlider = document.createElement('span');
        autoSendSlider.className = 'slider';

        autoSendSwitch.appendChild(autoSendInput);
        autoSendSwitch.appendChild(autoSendSlider);
        autoSendContainer.appendChild(autoSendLabelWrap);
        autoSendContainer.appendChild(autoSendSwitch);

        autoSendInput.onchange = function() {
            autoSendEnabled = this.checked;
            console.log(`🔄 Auto-send ${autoSendEnabled ? 'enabled' : 'disabled'}`);
        };

        // Typing Delay Toggle
        const typingDelayContainer = document.createElement('div');
        typingDelayContainer.className = 'control-row';

        const typingDelayLabelWrap = document.createElement('div');

        const typingDelayLabel = document.createElement('span');
        typingDelayLabel.className = 'control-label';
        typingDelayLabel.textContent = 'Human typing:';

        const typingDelayTooltip = document.createElement('span');
        typingDelayTooltip.className = 'tooltip';
        typingDelayTooltip.textContent = 'T';

        const typingTooltipText = document.createElement('span');
        typingTooltipText.className = 'tooltip-text';
        typingTooltipText.textContent = 'Simulates realistic human typing speed based on message length.';

        typingDelayTooltip.appendChild(typingTooltipText);
        typingDelayLabelWrap.appendChild(typingDelayLabel);
        typingDelayLabelWrap.appendChild(typingDelayTooltip);

        const typingDelaySwitch = document.createElement('label');
        typingDelaySwitch.className = 'switch';

        const typingDelayInput = document.createElement('input');
        typingDelayInput.type = 'checkbox';
        typingDelayInput.checked = useHumanDelay;

        const typingDelaySlider = document.createElement('span');
        typingDelaySlider.className = 'slider accent';

        typingDelaySwitch.appendChild(typingDelayInput);
        typingDelaySwitch.appendChild(typingDelaySlider);
        typingDelayContainer.appendChild(typingDelayLabelWrap);
        typingDelayContainer.appendChild(typingDelaySwitch);

        typingDelayInput.onchange = function() {
            useHumanDelay = this.checked;
            console.log(`⌨️ Human typing simulation ${useHumanDelay ? 'enabled' : 'disabled'}`);
        };

        // Add toggles to main section
        mainSection.appendChild(toggleContainer);
        mainSection.appendChild(autoSendContainer);
        mainSection.appendChild(typingDelayContainer);
        contentContainer.appendChild(mainSection);

        // Bot Persona & Configuration Section
        const configSection = document.createElement('div');
        configSection.className = 'control-section';

        // Section title
        const configTitle = document.createElement('div');
        configTitle.className = 'control-label';
        configTitle.textContent = 'Bot Configuration';
        configTitle.style.marginBottom = '12px';
        configTitle.style.fontWeight = '600';
        configSection.appendChild(configTitle);

        // Bot Persona Selector
        const personaContainer = document.createElement('div');
        personaContainer.className = 'control-row';

        const personaLabel = document.createElement('span');
        personaLabel.className = 'control-label';
        personaLabel.textContent = 'Bot Persona:';

        personaContainer.appendChild(personaLabel);

        const personaSelectContainer = document.createElement('div');
        personaSelectContainer.className = 'select-container';

        const personaSelect = document.createElement('select');
        personaSelect.className = 'custom-select';

        BOT_PERSONAS.forEach((persona, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = persona.name;
            option.selected = index === currentPersonaIndex;
            personaSelect.appendChild(option);
        });

        personaSelect.onchange = function() {
            currentPersonaIndex = parseInt(this.value);
            console.log(`🎭 Changed persona to ${BOT_PERSONAS[currentPersonaIndex].name}`);
        };

        personaSelectContainer.appendChild(personaSelect);
        configSection.appendChild(personaContainer);
        configSection.appendChild(personaSelectContainer);

        // Token Length Selector
        const tokenContainer = document.createElement('div');
        tokenContainer.className = 'control-row';
        tokenContainer.style.marginTop = '14px';

        const tokenLabel = document.createElement('span');
        tokenLabel.className = 'control-label';
        tokenLabel.textContent = 'Response Length:';

        tokenContainer.appendChild(tokenLabel);

        const tokenSelectContainer = document.createElement('div');
        tokenSelectContainer.className = 'select-container';

        const tokenSelect = document.createElement('select');
        tokenSelect.className = 'custom-select';

        TOKEN_OPTIONS.forEach((option, index) => {
            const optionElement = document.createElement('option');
            optionElement.value = index;
            optionElement.textContent = option.label;
            optionElement.selected = index === currentTokenIndex;
            tokenSelect.appendChild(optionElement);
        });

        tokenSelect.onchange = function() {
            currentTokenIndex = parseInt(this.value);
            console.log(`📏 Changed token length to ${TOKEN_OPTIONS[currentTokenIndex].label}`);
        };

        tokenSelectContainer.appendChild(tokenSelect);
        configSection.appendChild(tokenContainer);
        configSection.appendChild(tokenSelectContainer);

        // Add config section to content
        contentContainer.appendChild(configSection);

        // Add footer with version info
        const footer = document.createElement('div');
        footer.className = 'panel-footer';
        footer.textContent = 'Ultimate AI Bot v1.7';
        controlPanel.appendChild(footer);

        document.body.appendChild(controlPanel);
        makeDraggable(controlPanel, headerBar);
        console.log('✅ Enhanced control panel created');
    }

    // Add enhanced makeDraggable function with better touch support and boundary checking
    function makeDraggable(element, handle = null) {
        let startX, startY, startLeft, startTop;
        const dragHandle = handle || element;

        // Make sure the element has the correct positioning
        if (getComputedStyle(element).position !== 'fixed') {
            element.style.position = 'fixed';
        }

        dragHandle.style.cursor = 'move';

        // Mouse Events
        dragHandle.addEventListener('mousedown', startDrag);

        // Touch Events
        dragHandle.addEventListener('touchstart', startTouchDrag, { passive: false });

        function startDrag(e) {
            e.preventDefault();

            // Get the current position of the element and mouse
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(document.defaultView.getComputedStyle(element).left, 10);
            startTop = parseInt(document.defaultView.getComputedStyle(element).top, 10);

            // If NaN, set to 0
            if (isNaN(startLeft)) startLeft = 0;
            if (isNaN(startTop)) startTop = 0;

            // Add move and end event listeners
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        }

        function startTouchDrag(e) {
            e.preventDefault();

            // Get the current position of the element and touch
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startLeft = parseInt(document.defaultView.getComputedStyle(element).left, 10);
            startTop = parseInt(document.defaultView.getComputedStyle(element).top, 10);

            // If NaN, set to 0
            if (isNaN(startLeft)) startLeft = 0;
            if (isNaN(startTop)) startTop = 0;

            // Add move and end event listeners
            document.addEventListener('touchmove', touchDrag, { passive: false });
            document.addEventListener('touchend', stopTouchDrag);
        }

        function drag(e) {
            e.preventDefault();

            // Calculate new position
            const newLeft = startLeft + e.clientX - startX;
            const newTop = startTop + e.clientY - startY;

            // Apply boundary constraints
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const constrainedLeft = Math.max(0, Math.min(newLeft, viewportWidth - element.offsetWidth));
            const constrainedTop = Math.max(0, Math.min(newTop, viewportHeight - element.offsetHeight));

            // Update position
            element.style.left = constrainedLeft + 'px';
            element.style.top = constrainedTop + 'px';
        }

        function touchDrag(e) {
            e.preventDefault();

            // Calculate new position
            const newLeft = startLeft + e.touches[0].clientX - startX;
            const newTop = startTop + e.touches[0].clientY - startY;

            // Apply boundary constraints
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const constrainedLeft = Math.max(0, Math.min(newLeft, viewportWidth - element.offsetWidth));
            const constrainedTop = Math.max(0, Math.min(newTop, viewportHeight - element.offsetHeight));

            // Update position
            element.style.left = constrainedLeft + 'px';
            element.style.top = constrainedTop + 'px';
        }

        function stopDrag() {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
        }

        function stopTouchDrag() {
            document.removeEventListener('touchmove', touchDrag);
            document.removeEventListener('touchend', stopTouchDrag);
        }
    }

    function initialize() {
        try {
            console.log('🎬 Initializing bot...');
            // Initialize chat input
            const textInputs = document.getElementsByClassName(GUESS_TEXT_BOX_CLASS);
            if (textInputs.length === 0) {
                throw new Error('Chat input element not found');
            }
            guess_text_box = textInputs[0];
            console.log('✅ Found chat input');

            // Start the name reading process immediately and persistently
            attemptNameReading();

            // Add keydown event listener for message history navigation only
            guess_text_box.addEventListener('keydown', handleKeyPress);

            // Create control panel
            createControlPanel();

            // Start observer if bot is enabled
            if (botEnabled) {
                startObserver();
            }

            isInitialized = true;
            isProcessing = false;
        } catch (error) {
            handleError(ErrorTypes.INITIALIZATION_ERROR, error);
            isInitialized = false;
        }
    }

    // Start initialization
    setTimeout(initialize, 1000); // Give the page time to load before initializing
})();
