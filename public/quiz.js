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
    let quizContent = null;
    let backToARButton = null;
    let quizTitle = null;
    let progressFill = null;
    let progressText = null;

    // ============================================================================
    // CONTEXT DETECTION
    // ============================================================================
    
    /**
     * Detects if quiz is running in standalone page mode (quiz.html) or overlay mode (index.html)
     * @returns {boolean} True if standalone page, false if overlay
     */
    function isStandalonePage() {
        // Check if we're on quiz.html by looking for AR container
        // If AR container doesn't exist, we're on standalone quiz page
        const arContainer = document.getElementById('ar-container');
        return !arContainer;
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
        quizContent = document.getElementById('quiz-content');
        backToARButton = document.getElementById('back-to-ar-button');
        quizTitle = document.getElementById('quiz-title');
        progressFill = document.getElementById('progress-fill');
        progressText = document.getElementById('progress-text');
        
        if (!quizContent) {
            console.error('Quiz content element not found');
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

        // Update header
        if (quizTitle) {
            quizTitle.textContent = currentQuiz.title;
        }

        // Set up back button handler
        if (backToARButton) {
            backToARButton.onclick = backToAR;
        }

        // Render first question
        renderQuestion();
    }

    /**
     * Updates the progress indicator in the header
     */
    function updateProgress() {
        if (!currentQuiz) return;
        
        const totalQuestions = currentQuiz.questions.length;
        const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;
        
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
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
        const userAnswer = userAnswers[currentQuestionIndex];

        // Update progress
        updateProgress();

        // Build HTML
        let html = `
            <div class="question-card">
                <div class="question-number">Question ${currentQuestionIndex + 1}</div>
                <h2 class="question-title">${question.question}</h2>
                <div class="options-grid">
        `;

        // Add answer options
        question.options.forEach((option, index) => {
            let buttonClass = 'option-card';
            let icon = '';
            
            // If user has already answered this question correctly, show it as correct
            if (userAnswer !== undefined) {
                if (index === question.correct) {
                    buttonClass += ' correct';
                    icon = '<svg class="option-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
                } else if (index === userAnswer && index !== question.correct) {
                    buttonClass += ' incorrect';
                    icon = '<svg class="option-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
                }
            }
            
            html += `
                <button class="${buttonClass}" data-index="${index}" ${userAnswer !== undefined ? 'disabled' : ''}>
                    <span class="option-content">${option}</span>
                    ${icon}
                </button>
            `;
        });

        html += `
                </div>
                <div class="question-navigation">
        `;

        // Previous button
        if (currentQuestionIndex > 0) {
            html += `<button class="nav-btn secondary prev-button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Previous
            </button>`;
        } else {
            html += `<button class="nav-btn secondary prev-button" disabled>Previous</button>`;
        }

        // Next/Submit button
        if (currentQuestionIndex < currentQuiz.questions.length - 1) {
            html += `<button class="nav-btn primary next-button" ${userAnswer === undefined ? 'disabled' : ''}>
                Next
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            </button>`;
        } else {
            html += `<button class="nav-btn primary submit-button" ${userAnswer === undefined ? 'disabled' : ''}>
                Submit Quiz
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
            </button>`;
        }

        html += `
                </div>
            </div>
        `;

        quizContent.innerHTML = html;

        // Scroll to top smoothly
        window.scrollTo({ top: 0, behavior: 'smooth' });

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
        const answerOptions = quizContent.querySelectorAll('.option-card');
        const nextButton = quizContent.querySelector('.next-button');
        const submitButton = quizContent.querySelector('.submit-button');
        const prevButton = quizContent.querySelector('.prev-button');
        
        const userAnswer = userAnswers[currentQuestionIndex];
        
        // If already answered, don't attach click listeners
        if (userAnswer !== undefined) {
            return;
        }
        
        answerOptions.forEach(button => {
            const answerIndex = parseInt(button.getAttribute('data-index'));
            
            button.addEventListener('click', (e) => {
                const clickedButton = e.target.closest('.option-card');
                const selectedIndex = parseInt(clickedButton.getAttribute('data-index'));
                
                // Check if this is the correct answer
                if (selectedIndex === correctAnswerIndex) {
                    // Correct answer!
                    clickedButton.classList.add('correct');
                    clickedButton.innerHTML = `
                        <span class="option-content">${question.options[selectedIndex]}</span>
                        <svg class="option-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 6L9 17l-5-5"/>
                        </svg>
                    `;
                    
                    // Store the correct answer
                    userAnswers[currentQuestionIndex] = selectedIndex;
                    
                    // Enable next/submit button
                    if (nextButton) {
                        nextButton.disabled = false;
                    }
                    if (submitButton) {
                        submitButton.disabled = false;
                    }
                    
                    // Disable all other buttons
                    answerOptions.forEach(opt => {
                        opt.disabled = true;
                        if (opt !== clickedButton) {
                            opt.classList.add('disabled');
                        }
                    });
                    
                    if (window.Toast) {
                        window.Toast.success('Correct! Well done!', 'Success', 2000);
                    }
                } else {
                    // Wrong answer
                    clickedButton.classList.add('incorrect');
                    clickedButton.innerHTML = `
                        <span class="option-content">${question.options[selectedIndex]}</span>
                        <svg class="option-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    `;
                    clickedButton.disabled = true;
                    
                    if (window.Toast) {
                        window.Toast.error('That\'s not correct. Try again!', 'Incorrect', 2000);
                    }
                }
            });
        });

        // Navigation buttons
        if (prevButton && !prevButton.disabled) {
            prevButton.addEventListener('click', () => {
                if (currentQuestionIndex > 0) {
                    currentQuestionIndex--;
                    renderQuestion();
                }
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                if (userAnswers[currentQuestionIndex] !== undefined) {
                    if (currentQuestionIndex < currentQuiz.questions.length - 1) {
                        currentQuestionIndex++;
                        renderQuestion();
                    }
                } else {
                    if (window.Toast) {
                        window.Toast.warning('Please select the correct answer first.', 'Select Answer', 2000);
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
                        window.Toast.warning('Please select the correct answer first.', 'Select Answer', 2000);
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

        // Update progress to 100%
        if (progressFill) {
            progressFill.style.width = '100%';
        }
        if (progressText) {
            progressText.textContent = 'Completed!';
        }

        // Build recap HTML
        let html = `
            <div class="results-card">
                <div class="results-header">
                    <svg class="results-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <h2 class="results-title">Quiz Complete!</h2>
                    <p class="results-subtitle">Here's what you learned:</p>
                </div>
                <div class="recap-list">
        `;

        // Show each question and answer
        currentQuiz.questions.forEach((question, index) => {
            const userAnswer = userAnswers[index];
            const userAnswerText = question.options[userAnswer];

            html += `
                <div class="recap-card">
                    <div class="recap-header">
                        <span class="recap-number">Q${index + 1}</span>
                        <span class="recap-status correct">✓ Correct</span>
                    </div>
                    <div class="recap-question">${question.question}</div>
                    <div class="recap-answer">
                        <strong>Your answer:</strong> ${userAnswerText}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="results-actions">
                    <button class="nav-btn primary restart-button">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"/>
                            <polyline points="1 20 1 14 7 14"/>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                        Restart Quiz
                    </button>
                </div>
            </div>
        `;

        quizContent.innerHTML = html;

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Attach restart button listener
        const restartButton = quizContent.querySelector('.restart-button');
        if (restartButton) {
            restartButton.addEventListener('click', () => {
                currentQuestionIndex = 0;
                userAnswers = [];
                renderQuestion();
            });
        }
    }

    /**
     * Returns to AR view
     */
    async function backToAR() {
        console.log('Returning to AR view');
        
        const isStandalone = isStandalonePage();
        
        if (isStandalone) {
            // Standalone mode: Navigate to index.html with fade transition
            document.body.classList.add('fade-out');
            
            // Wait for fade animation to complete
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 300); // Match CSS animation duration
        } else {
            // Overlay mode: Hide quiz and restore AR view
            // This shouldn't happen with new structure, but keep for compatibility
            const quizView = document.getElementById('quiz-view');
            if (quizView) {
                quizView.classList.add('hidden');
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
