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

        // Show quiz view (using display, not visibility, for cleaner state)
        quizView.classList.remove('hidden');
        
        // CRITICAL iOS FIX: Add passive touch listeners to ensure scroll works
        // This prevents any event interference
        const ensureScrollWorks = () => {
            if (quizScrollWrapper) {
                // Add passive touch listeners to "prime" the scroll
                const touchHandler = (e) => {
                    // Don't prevent default - let iOS handle scroll naturally
                };
                quizScrollWrapper.addEventListener('touchstart', touchHandler, { passive: true });
                quizScrollWrapper.addEventListener('touchmove', touchHandler, { passive: true });
                quizScrollWrapper.addEventListener('touchend', touchHandler, { passive: true });
            }
        };
        
        // Reset scroll position
        quizScrollWrapper.scrollTop = 0;
        
        // Force layout calculations
        void quizView.offsetHeight;
        void quizScrollWrapper.offsetHeight;
        void quizContent.offsetHeight;
        void quizScrollWrapper.scrollHeight;
        
        // Add touch listeners
        ensureScrollWorks();
        
        // iOS Safari needs the scroll to be "used" before it works properly
        // Programmatically scroll a tiny amount to wake up the scroll compositor
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Scroll down 1px
                quizScrollWrapper.scrollTop = 1;
                // Force reflow
                void quizScrollWrapper.offsetHeight;
                requestAnimationFrame(() => {
                    // Scroll back to top
                    quizScrollWrapper.scrollTop = 0;
                    // Force one more layout to ensure it's applied
                    void quizScrollWrapper.offsetHeight;
                });
            });
        });

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
            // Force layout calculation
            void quizScrollWrapper.offsetHeight;
        }

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
        
        // Hide quiz view
        if (quizView) {
            quizView.classList.add('hidden');
        }
        
        // Reset scroll wrapper
        if (quizScrollWrapper) {
            quizScrollWrapper.scrollTop = 0;
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
