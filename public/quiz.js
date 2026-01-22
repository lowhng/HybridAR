// Quiz System for AR Experience
// Provides interactive quizzes based on the AR model type

(function() {
    'use strict';

    // ============================================================================
    // QUIZ DATA
    // ============================================================================
    
    let quizData = null;
    let quizDataLoaded = false;
    let quizDataLoading = false;

    // ============================================================================
    // STATE
    // ============================================================================
    
    let currentQuiz = null;
    let currentQuestionIndex = 0;
    let userAnswers = [];
    let quizView = null;
    let quizContent = null;
    let backToARButton = null;
    let quizScrollWrapper = null;

    // ============================================================================
    // iOS SCROLL FIX
    // ============================================================================
    
    /**
     * Forces iOS Safari to properly initialize scroll compositor.
     * This fixes the freeze-on-first-scroll bug on iOS Safari, specifically
     * the freeze that happens when lifting finger (momentum scroll issue).
     * More aggressive version that simulates what app switching or video overlay does.
     * @param {HTMLElement} element - The scrollable element to fix
     */
    function forceIOSRepaint(element) {
        if (!element) return;
        
        // Force multiple synchronous layout/reflows to wake up compositor
        void element.offsetHeight;
        void element.scrollHeight;
        void element.clientHeight;
        
        const maxScroll = element.scrollHeight - element.clientHeight;
        
        if (maxScroll > 0) {
            // CRITICAL: Do a visible scroll that will trigger momentum scroll compositor
            // Scroll enough to ensure momentum scrolling is initialized
            element.scrollTop = Math.min(10, maxScroll);
            
            // Force immediate reflow to commit the scroll
            void element.offsetHeight;
            void element.scrollTop; // Force read to ensure layout
            
            // Wait for paint, then reset
            requestAnimationFrame(() => {
                // Reset scroll position
                element.scrollTop = 0;
                void element.offsetHeight;
                
                // CRITICAL: Do one more small scroll to ensure momentum compositor is ready
                // This simulates what happens when user lifts finger - momentum needs to be ready
                requestAnimationFrame(() => {
                    if (maxScroll > 0) {
                        element.scrollTop = 2;
                        void element.offsetHeight;
                        requestAnimationFrame(() => {
                            element.scrollTop = 0;
                            void element.offsetHeight;
                        });
                    }
                });
            });
        } else {
            // Even if no scrollable content, still trigger compositor
            element.scrollTop = 0.5;
            void element.offsetHeight;
            requestAnimationFrame(() => {
                element.scrollTop = 0;
                void element.offsetHeight;
            });
        }
    }

    // ============================================================================
    // DATA LOADING
    // ============================================================================
    
    /**
     * Loads quiz data from JSON file
     * @returns {Promise<Object>} The quiz data object
     */
    async function loadQuizData() {
        if (quizDataLoaded && quizData) {
            return quizData;
        }
        
        if (quizDataLoading) {
            // Wait for existing load to complete
            while (quizDataLoading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return quizData;
        }
        
        quizDataLoading = true;
        
        try {
            const response = await fetch('quiz-data.json');
            if (!response.ok) {
                throw new Error(`Failed to load quiz data: ${response.status} ${response.statusText}`);
            }
            quizData = await response.json();
            quizDataLoaded = true;
            console.log('Quiz data loaded successfully');
            return quizData;
        } catch (error) {
            console.error('Error loading quiz data:', error);
            if (window.Toast) {
                window.Toast.error('Failed to load quiz data. Please refresh the page.', 'Quiz Data Error', 5000);
            }
            quizData = {}; // Set to empty object to prevent repeated failed attempts
            throw error;
        } finally {
            quizDataLoading = false;
        }
    }

    // ============================================================================
    // DOM ELEMENTS
    // ============================================================================
    
    function getDOMElements() {
        quizView = document.getElementById('quiz-view');
        quizContent = document.getElementById('quiz-content');
        backToARButton = document.getElementById('back-to-ar-button');
        quizScrollWrapper = document.getElementById('quiz-scroll-wrapper');
        
        if (!quizView || !quizContent || !quizScrollWrapper) {
            console.error('Quiz DOM elements not found');
            return false;
        }
        return true;
    }

    // ============================================================================
    // QUIZ DISPLAY
    // ============================================================================
    
    /**
     * Shows the quiz for a given model type
     * @param {string} modelType - The type of model ('wire-model', 'green-cube')
     */
    async function showQuiz(modelType) {
        console.log('Showing quiz for model type:', modelType);
        
        if (!getDOMElements()) {
            console.error('Failed to get quiz DOM elements');
            if (window.Toast) {
                window.Toast.error('Quiz UI elements not found. Please refresh the page.', 'Quiz Error', 5000);
            }
            return;
        }

        // Load quiz data if not already loaded
        try {
            await loadQuizData();
        } catch (error) {
            console.error('Failed to load quiz data:', error);
            return;
        }

        // Get quiz data for this model type
        currentQuiz = quizData[modelType];
        
        if (!currentQuiz) {
            console.error('No quiz data found for model type:', modelType);
            if (window.Toast) {
                window.Toast.error(`No quiz available for ${modelType}`, 'Quiz Error', 5000);
            }
            return;
        }

        // Reset quiz state
        currentQuestionIndex = 0;
        userAnswers = [];

        // Hide AR container completely
        const arContainer = document.getElementById('ar-container');
        if (arContainer) {
            arContainer.style.display = 'none';
            const canvas = arContainer.querySelector('canvas');
            if (canvas) {
                canvas.style.display = 'none';
                canvas.style.visibility = 'hidden';
            }
        }

        // Hide reset button when in quiz mode
        const resetButton = document.getElementById('reset-button');
        if (resetButton) {
            resetButton.classList.add('hidden');
        }

        // Render first question
        renderQuestion();

        // Hide XR overlay to prevent compositor interference
        const xrOverlay = document.getElementById('xr-overlay');
        if (xrOverlay) {
            xrOverlay.style.display = 'none';
        }

        // Show quiz view
        quizView.classList.remove('hidden');
        
        // Force layout calculation after showing
        void quizView.offsetHeight;
        
        // Reset scroll position (minimal scroll setup - should rarely be needed)
        if (quizScrollWrapper) {
            quizScrollWrapper.scrollTop = 0;
            // Force layout to ensure proper rendering
            void quizScrollWrapper.offsetHeight;
        }

        // Set up back button handler
        if (backToARButton) {
            backToARButton.onclick = backToAR;
        }
    }

    /**
     * Renders the current question
     */
    function renderQuestion() {
        if (!currentQuiz || !quizContent) {
            return;
        }

        const question = currentQuiz.questions[currentQuestionIndex];
        const totalQuestions = currentQuiz.questions.length;
        const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;

        // Build HTML
        let html = `
            <div class="quiz-header">
                <h2>${currentQuiz.title}</h2>
                <div class="quiz-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">Question ${currentQuestionIndex + 1} of ${totalQuestions}</span>
                </div>
            </div>
            <div class="question-container">
                <div class="question-text">${question.question}</div>
                <div class="options-container">
        `;

        // Add answer options
        const userAnswer = userAnswers[currentQuestionIndex];
        question.options.forEach((option, index) => {
            let buttonClass = 'option-button';
            
            // If user has already answered this question correctly, show it as correct
            if (userAnswer !== undefined && index === question.correct) {
                buttonClass += ' correct';
            }
            
            html += `
                <button class="${buttonClass}" data-index="${index}">
                    ${option}
                </button>
            `;
        });

        html += `
                </div>
            </div>
            <div class="quiz-navigation">
        `;

        // Previous button (disabled on first question)
        if (currentQuestionIndex > 0) {
            html += `<button class="nav-button prev-button">Previous</button>`;
        } else {
            html += `<button class="nav-button prev-button" disabled>Previous</button>`;
        }

        // Next/Submit button
        if (currentQuestionIndex < totalQuestions - 1) {
            html += `<button class="nav-button primary next-button">Next</button>`;
        } else {
            html += `<button class="nav-button primary submit-button">Submit Quiz</button>`;
        }

        html += `</div>`;

        quizContent.innerHTML = html;

        // Attach event listeners
        attachQuestionListeners();
    }

    /**
     * Attaches event listeners to question elements
     */
    function attachQuestionListeners() {
        const question = currentQuiz.questions[currentQuestionIndex];
        const correctAnswerIndex = question.correct;
        
        // Answer option buttons
        const answerOptions = quizContent.querySelectorAll('.option-button');
        const nextButton = quizContent.querySelector('.next-button');
        const submitButton = quizContent.querySelector('.submit-button');
        
        // If user has already answered this question correctly, enable next/submit button
        if (userAnswers[currentQuestionIndex] !== undefined) {
            if (nextButton) nextButton.disabled = false;
            if (submitButton) submitButton.disabled = false;
            
            // Disable all buttons since the question is already answered
            answerOptions.forEach(opt => {
                opt.disabled = true;
                opt.style.pointerEvents = 'none';
            });
            return; // Don't attach click listeners if already answered
        } else {
            // Disable next/submit buttons initially if no correct answer selected yet
            if (nextButton) nextButton.disabled = true;
            if (submitButton) submitButton.disabled = true;
        }
        
        answerOptions.forEach(button => {
            const answerIndex = parseInt(button.getAttribute('data-index'));
            
            // If this answer was previously marked as incorrect, disable it
            if (button.classList.contains('incorrect')) {
                button.disabled = true;
                button.style.pointerEvents = 'none';
                return;
            }
            
            button.addEventListener('click', (e) => {
                const clickedButton = e.target;
                const selectedIndex = parseInt(clickedButton.getAttribute('data-index'));
                
                // Check if this is the correct answer
                if (selectedIndex === correctAnswerIndex) {
                    // Correct answer!
                    clickedButton.classList.add('correct');
                    clickedButton.classList.remove('selected');
                    
                    // Store the correct answer
                    userAnswers[currentQuestionIndex] = selectedIndex;
                    
                    // Enable next/submit button
                    if (nextButton) {
                        nextButton.disabled = false;
                    }
                    if (submitButton) {
                        submitButton.disabled = false;
                    }
                    
                    // Disable all other buttons to prevent further clicks
                    answerOptions.forEach(opt => {
                        if (opt !== clickedButton) {
                            opt.disabled = true;
                            opt.style.pointerEvents = 'none';
                        }
                    });
                    
                    if (window.Toast) {
                        window.Toast.success('Correct! You can now proceed.', 'Well Done', 2000);
                    }
                } else {
                    // Wrong answer
                    clickedButton.classList.add('incorrect');
                    clickedButton.classList.remove('selected');
                    clickedButton.disabled = true;
                    clickedButton.style.pointerEvents = 'none';
                    
                    if (window.Toast) {
                        window.Toast.error('That\'s not correct. Please try again.', 'Incorrect Answer', 2000);
                    }
                }
            });
        });

        // Navigation buttons
        const prevButton = quizContent.querySelector('.prev-button');
        if (prevButton && !prevButton.disabled) {
            prevButton.addEventListener('click', () => {
                if (currentQuestionIndex > 0) {
                    currentQuestionIndex--;
                    renderQuestion();
                    // Reset scroll position when navigating
                    if (quizScrollWrapper) {
                        quizScrollWrapper.scrollTop = 0;
                    }
                }
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                if (userAnswers[currentQuestionIndex] !== undefined) {
                    if (currentQuestionIndex < currentQuiz.questions.length - 1) {
                        currentQuestionIndex++;
                        renderQuestion();
                        // Reset scroll position when navigating
                        if (quizScrollWrapper) {
                            quizScrollWrapper.scrollTop = 0;
                        }
                    }
                } else {
                    if (window.Toast) {
                        window.Toast.warning('Please select the correct answer before continuing.', 'Select Answer', 3000);
                    }
                }
            });
        }

        if (submitButton) {
            submitButton.addEventListener('click', () => {
                if (userAnswers[currentQuestionIndex] !== undefined) {
                    showResults();
                } else {
                    if (window.Toast) {
                        window.Toast.warning('Please select the correct answer before submitting.', 'Select Answer', 3000);
                    }
                }
            });
        }
    }

    /**
     * Shows quiz recap
     */
    function showResults() {
        if (!currentQuiz || !quizContent) {
            return;
        }

        // Build recap HTML
        let html = `
            <div class="quiz-header">
                <h2>${currentQuiz.title} - Recap</h2>
            </div>
            <div class="quiz-recap">
                <div class="recap-intro">
                    <p>Here's a summary of what you learned:</p>
                </div>
                <div class="recap-list">
        `;

        // Show each question and answer
        currentQuiz.questions.forEach((question, index) => {
            const userAnswer = userAnswers[index];
            const userAnswerText = question.options[userAnswer];

            html += `
                <div class="recap-item">
                    <div class="recap-number">Question ${index + 1}</div>
                    <div class="recap-content">
                        <div class="recap-question">${question.question}</div>
                        <div class="recap-answer">${userAnswerText}</div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="quiz-navigation">
                    <button class="nav-button primary restart-button">Restart Quiz</button>
                </div>
            </div>
        `;

        quizContent.innerHTML = html;

        // Reset scroll position after content is rendered
        if (quizScrollWrapper) {
            quizScrollWrapper.scrollTop = 0;
            void quizScrollWrapper.offsetHeight;
        }

        // Attach restart button listener
        const restartButton = quizContent.querySelector('.restart-button');
        if (restartButton) {
            restartButton.addEventListener('click', () => {
                currentQuestionIndex = 0;
                userAnswers = [];
                renderQuestion();
                // Reset scroll position when restarting
                if (quizScrollWrapper) {
                    quizScrollWrapper.scrollTop = 0;
                }
            });
        }
    }

    /**
     * Returns to AR view
     */
    async function backToAR() {
        console.log('Returning to AR view');
        
        // Hide quiz view first
        if (quizView) {
            quizView.classList.add('hidden');
        }
        
        // Reset scroll wrapper
        if (quizScrollWrapper) {
            quizScrollWrapper.scrollTop = 0;
        }

        // CRITICAL: Hide logo container immediately to prevent it from showing
        const logoContainer = document.getElementById('logo-container');
        if (logoContainer) {
            logoContainer.classList.add('hidden');
        }

        // CRITICAL: Clean up AR resources and clear canvas BEFORE showing AR container
        // This prevents the old start screen and spawned models from being visible
        const arContainer = document.getElementById('ar-container');
        if (arContainer) {
            // Clear canvas before showing container
            const canvas = arContainer.querySelector('canvas');
            if (canvas) {
                // Hide canvas first
                canvas.style.display = 'none';
                canvas.style.visibility = 'hidden';
                canvas.style.opacity = '0';
                
                // Clear canvas content if renderer is available
                if (window.WebXRAR && window.WebXRAR._renderer) {
                    try {
                        const renderer = window.WebXRAR._renderer;
                        // Clear with opaque black to hide any previous content
                        renderer.setClearColor(0x000000, 1);
                        renderer.clear();
                        // Reset back to transparent for next session
                        renderer.setClearColor(0x000000, 0);
                    } catch (e) {
                        console.warn('Error clearing canvas:', e);
                    }
                }
            }
            
            // Ensure container is hidden initially
            arContainer.style.display = 'none';
            arContainer.style.visibility = 'hidden';
        }

        // Clean up AR resources if cleanup function is available
        if (window.WebXRAR && typeof window.WebXRAR.cleanup === 'function') {
            try {
                window.WebXRAR.cleanup();
            } catch (e) {
                console.warn('Error during AR cleanup:', e);
            }
        } else if (window.WebXRAR && window.WebXRAR.reset) {
            // Fallback: use reset function to clear content
            try {
                window.WebXRAR.reset();
            } catch (e) {
                console.warn('Error during AR reset:', e);
            }
        }

        // Restore XR overlay (was hidden when quiz was shown)
        const xrOverlay = document.getElementById('xr-overlay');
        if (xrOverlay) {
            xrOverlay.style.display = '';
        }

        // Reset quiz state
        currentQuiz = null;
        currentQuestionIndex = 0;
        userAnswers = [];

        // Show start button and trigger AR initialization
        const startButton = document.getElementById('start-button');
        if (startButton) {
            startButton.classList.remove('hidden');
            startButton.disabled = false;
            startButton.textContent = 'Start AR';
            
            // Programmatically trigger AR initialization
            try {
                if (window.ARController && window.ARController.init) {
                    startButton.disabled = true;
                    startButton.textContent = 'Starting...';
                    await window.ARController.init();
                    
                    // Show reset button after AR is initialized
                    const resetButton = document.getElementById('reset-button');
                    if (resetButton) {
                        resetButton.classList.remove('hidden');
                    }
                } else {
                    // Fallback: click the button programmatically
                    startButton.click();
                }
            } catch (error) {
                console.error('Error restarting AR:', error);
                if (window.Toast) {
                    window.Toast.error('Failed to restart AR. Please click "Start AR" manually.', 'AR Restart Failed', 5000, true);
                }
                startButton.disabled = false;
                startButton.textContent = 'Start AR';
            }
        }
    }

    // ============================================================================
    // EXPORT
    // ============================================================================
    
    window.QuizSystem = {
        showQuiz: showQuiz,
        backToAR: backToAR
    };

    console.log('QuizSystem initialized');
})();
