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

    // ============================================================================
    // iOS SCROLL FIX
    // ============================================================================
    
    /**
     * Forces iOS Safari to properly initialize scroll compositor.
     * This fixes the freeze-on-first-scroll bug on iOS Safari.
     * @param {HTMLElement} element - The scrollable element to fix
     */
    function forceIOSRepaint(element) {
        if (!element) return;
        
        // Force a synchronous layout/reflow
        void element.offsetHeight;
        
        // Trigger a micro-scroll to wake up the scroll compositor
        // This must happen after the element is visible and laid out
        element.scrollTop = 0.5;
        
        // Use RAF to ensure scroll happens after paint
        requestAnimationFrame(() => {
            element.scrollTop = 0;
        });
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
        
        if (!quizView || !quizContent) {
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

        // Hide AR container completely to free up resources
        const arContainer = document.getElementById('ar-container');
        if (arContainer) {
            arContainer.style.display = 'none';
            // Also hide any canvas elements inside
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

        // COMPLETELY DIFFERENT APPROACH: Make body scrollable instead of nested fixed element
        // This is more reliable on iOS Safari which has issues with nested fixed scrollable elements
        
        // Change body to be scrollable (not fixed)
        document.body.style.position = 'relative';
        document.body.style.overflow = 'auto';
        document.body.style.height = 'auto';
        document.body.style.minHeight = '100vh';
        document.documentElement.style.height = 'auto';
        document.documentElement.style.overflow = 'auto';

        // Render first question BEFORE showing view
        renderQuestion();

        // Show quiz view
        quizView.classList.remove('hidden');
        
        // Reset scroll to top of body
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        
        // Force layout calculation
        void quizView.offsetHeight;
        void document.body.offsetHeight;

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
        question.options.forEach((option, index) => {
            html += `
                <button class="option-button" data-index="${index}">
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
        // Answer option buttons
        const answerOptions = quizContent.querySelectorAll('.option-button');
        answerOptions.forEach(button => {
            button.addEventListener('click', (e) => {
                // Remove previous selection
                answerOptions.forEach(opt => opt.classList.remove('selected'));
                
                // Mark this option as selected
                e.target.classList.add('selected');
                
                // Store answer
                const answerIndex = parseInt(e.target.getAttribute('data-index'));
                userAnswers[currentQuestionIndex] = answerIndex;
            });
        });

        // Navigation buttons
        const prevButton = quizContent.querySelector('.prev-button');
        if (prevButton && !prevButton.disabled) {
            prevButton.addEventListener('click', () => {
                if (currentQuestionIndex > 0) {
                    currentQuestionIndex--;
                    renderQuestion();
                }
            });
        }

        const nextButton = quizContent.querySelector('.next-button');
        if (nextButton) {
            nextButton.addEventListener('click', () => {
                if (userAnswers[currentQuestionIndex] !== undefined) {
                    if (currentQuestionIndex < currentQuiz.questions.length - 1) {
                        currentQuestionIndex++;
                        renderQuestion();
                    }
                } else {
                    if (window.Toast) {
                        window.Toast.warning('Please select an answer before continuing.', 'Select Answer', 3000);
                    }
                }
            });
        }

        const submitButton = quizContent.querySelector('.submit-button');
        if (submitButton) {
            submitButton.addEventListener('click', () => {
                if (userAnswers[currentQuestionIndex] !== undefined) {
                    showResults();
                } else {
                    if (window.Toast) {
                        window.Toast.warning('Please select an answer before submitting.', 'Select Answer', 3000);
                    }
                }
            });
        }
    }

    /**
     * Shows quiz results
     */
    function showResults() {
        if (!currentQuiz || !quizContent) {
            return;
        }

        const totalQuestions = currentQuiz.questions.length;
        let correctCount = 0;

        // Calculate score
        currentQuiz.questions.forEach((question, index) => {
            if (userAnswers[index] === question.correct) {
                correctCount++;
            }
        });

        const score = Math.round((correctCount / totalQuestions) * 100);

        // Build results HTML
        let html = `
            <div class="quiz-header">
                <h2>${currentQuiz.title} - Results</h2>
            </div>
            <div class="quiz-results">
                <div class="score-display">
                    <div class="score-circle">
                        <div class="score-value">${score}%</div>
                    </div>
                    <p class="score-text">You got ${correctCount} out of ${totalQuestions} questions correct!</p>
                </div>
                <div class="results-breakdown">
        `;

        // Show each question and answer
        currentQuiz.questions.forEach((question, index) => {
            const userAnswer = userAnswers[index];
            const isCorrect = userAnswer === question.correct;
            const userAnswerText = question.options[userAnswer];
            const correctAnswerText = question.options[question.correct];

            html += `
                <div class="result-item ${isCorrect ? 'correct' : 'incorrect'}">
                    <div class="result-icon">${isCorrect ? '✓' : '✗'}</div>
                    <div class="result-content">
                        <div class="result-question">${question.question}</div>
                        <div class="result-answer">
                            <strong>Your answer:</strong> ${userAnswerText}
                        </div>
                        ${!isCorrect ? `<div class="result-correct"><strong>Correct answer:</strong> ${correctAnswerText}</div>` : ''}
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

        // Reset scroll position after content is rendered (using body scroll now)
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        
        // Force layout calculation
        void document.body.offsetHeight;

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
        
        // Restore body positioning for AR mode
        document.body.style.position = 'fixed';
        document.body.style.overflow = 'hidden';
        document.body.style.height = '100%';
        document.body.style.minHeight = '';
        document.documentElement.style.height = '100%';
        document.documentElement.style.overflow = 'hidden';
        
        // Reset scroll
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        
        // Hide quiz view
        if (quizView) {
            quizView.classList.add('hidden');
        }

        // Show AR container
        const arContainer = document.getElementById('ar-container');
        if (arContainer) {
            arContainer.style.display = 'block';
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
                    window.Toast.error('Failed to restart AR. Please click "Start AR" manually.', 'AR Restart Failed', 5000);
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
