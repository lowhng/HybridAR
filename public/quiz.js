// Quiz System
// Handles quiz rendering and state management based on model type

// ============================================================================
// QUIZ DATA STRUCTURE
// ============================================================================

const quizData = {
    'wire-model': {
        title: 'Wire Model Quiz',
        questions: [
            {
                question: 'What is the primary material used in wire models?',
                options: ['Copper', 'Aluminum', 'Steel', 'Plastic'],
                correct: 0
            },
            {
                question: 'Wire models are typically used for:',
                options: ['Structural analysis', 'Decorative purposes', 'Electrical circuits', 'All of the above'],
                correct: 3
            },
            {
                question: 'What is the advantage of wireframe visualization?',
                options: ['Faster rendering', 'Better detail', 'More colors', 'Larger file size'],
                correct: 0
            }
        ]
    },
    'green-cube': {
        title: 'Cube Quiz',
        questions: [
            {
                question: 'How many faces does a cube have?',
                options: ['4', '6', '8', '12'],
                correct: 1
            },
            {
                question: 'What is the volume of a cube with side length 2?',
                options: ['4', '6', '8', '10'],
                correct: 2
            },
            {
                question: 'A cube is a type of:',
                options: ['Sphere', 'Prism', 'Pyramid', 'Cylinder'],
                correct: 1
            }
        ]
    },
    'mindar-cube': {
        title: 'AR Cube Quiz',
        questions: [
            {
                question: 'What technology is used for AR tracking in this app?',
                options: ['GPS', 'Image tracking', 'Bluetooth', 'WiFi'],
                correct: 1
            },
            {
                question: 'AR stands for:',
                options: ['Artificial Reality', 'Augmented Reality', 'Advanced Rendering', 'Automated Response'],
                correct: 1
            },
            {
                question: 'What library is used for 3D rendering?',
                options: ['React', 'Three.js', 'Vue', 'Angular'],
                correct: 1
            }
        ]
    }
};

// ============================================================================
// QUIZ STATE MANAGEMENT
// ============================================================================

let currentQuiz = null;
let currentQuestionIndex = 0;
let userAnswers = [];
let quizStarted = false;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

function getQuizElements() {
    return {
        quizView: document.getElementById('quiz-view'),
        quizContent: document.getElementById('quiz-content'),
        backToARButton: document.getElementById('back-to-ar-button'),
        arContainer: document.getElementById('ar-container')
    };
}

// ============================================================================
// QUIZ RENDERING
// ============================================================================

function renderQuiz(modelType) {
    const elements = getQuizElements();
    if (!elements.quizView || !elements.quizContent) {
        console.error('Quiz elements not found');
        return;
    }

    // Get quiz data for this model type
    currentQuiz = quizData[modelType];
    if (!currentQuiz) {
        console.error(`No quiz data found for model type: ${modelType}`);
        currentQuiz = quizData['green-cube']; // Fallback
    }

    // Reset quiz state
    currentQuestionIndex = 0;
    userAnswers = [];
    quizStarted = true;

    // Render quiz
    renderQuestion();
}

function renderQuestion() {
    const elements = getQuizElements();
    if (!elements.quizContent || !currentQuiz) return;

    const question = currentQuiz.questions[currentQuestionIndex];
    if (!question) {
        renderResults();
        return;
    }

    const progress = ((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100;

    elements.quizContent.innerHTML = `
        <div class="quiz-header">
            <h2>${currentQuiz.title}</h2>
            <div class="quiz-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                <span class="progress-text">Question ${currentQuestionIndex + 1} of ${currentQuiz.questions.length}</span>
            </div>
        </div>
        <div class="question-container">
            <h3 class="question-text">${question.question}</h3>
            <div class="options-container">
                ${question.options.map((option, index) => `
                    <button class="option-button" data-index="${index}">
                        ${option}
                    </button>
                `).join('')}
            </div>
        </div>
        <div class="quiz-navigation">
            ${currentQuestionIndex > 0 ? '<button id="prev-question" class="nav-button">Previous</button>' : ''}
            <button id="next-question" class="nav-button primary" ${currentQuestionIndex === currentQuiz.questions.length - 1 ? 'style="display:none"' : ''}>Next</button>
            <button id="submit-quiz" class="nav-button primary" ${currentQuestionIndex < currentQuiz.questions.length - 1 ? 'style="display:none"' : ''}>Submit Quiz</button>
        </div>
    `;

    // Attach event listeners
    attachQuestionListeners();
}

function attachQuestionListeners() {
    // Option buttons
    const optionButtons = document.querySelectorAll('.option-button');
    optionButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove previous selection
            optionButtons.forEach(btn => btn.classList.remove('selected'));
            // Select this option
            button.classList.add('selected');
            // Store answer
            userAnswers[currentQuestionIndex] = parseInt(button.dataset.index);
        });
    });

    // Previous button
    const prevButton = document.getElementById('prev-question');
    if (prevButton) {
        prevButton.addEventListener('click', () => {
            if (currentQuestionIndex > 0) {
                currentQuestionIndex--;
                renderQuestion();
            }
        });
    }

    // Next button
    const nextButton = document.getElementById('next-question');
    if (nextButton) {
        nextButton.addEventListener('click', () => {
            if (userAnswers[currentQuestionIndex] !== undefined) {
                if (currentQuestionIndex < currentQuiz.questions.length - 1) {
                    currentQuestionIndex++;
                    renderQuestion();
                }
            } else {
                alert('Please select an answer before proceeding.');
            }
        });
    }

    // Submit button
    const submitButton = document.getElementById('submit-quiz');
    if (submitButton) {
        submitButton.addEventListener('click', () => {
            if (userAnswers[currentQuestionIndex] !== undefined) {
                renderResults();
            } else {
                alert('Please select an answer before submitting.');
            }
        });
    }
}

function renderResults() {
    const elements = getQuizElements();
    if (!elements.quizContent || !currentQuiz) return;

    // Calculate score
    let correctCount = 0;
    currentQuiz.questions.forEach((question, index) => {
        if (userAnswers[index] === question.correct) {
            correctCount++;
        }
    });

    const score = Math.round((correctCount / currentQuiz.questions.length) * 100);

    elements.quizContent.innerHTML = `
        <div class="quiz-results">
            <h2>Quiz Complete!</h2>
            <div class="score-display">
                <div class="score-circle">
                    <span class="score-value">${score}%</span>
                </div>
                <p class="score-text">You got ${correctCount} out of ${currentQuiz.questions.length} questions correct</p>
            </div>
            <div class="results-breakdown">
                ${currentQuiz.questions.map((question, index) => {
                    const userAnswer = userAnswers[index];
                    const isCorrect = userAnswer === question.correct;
                    return `
                        <div class="result-item ${isCorrect ? 'correct' : 'incorrect'}">
                            <div class="result-icon">${isCorrect ? '✓' : '✗'}</div>
                            <div class="result-content">
                                <p class="result-question">${question.question}</p>
                                <p class="result-answer">Your answer: ${question.options[userAnswer] || 'Not answered'}</p>
                                ${!isCorrect ? `<p class="result-correct">Correct answer: ${question.options[question.correct]}</p>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// ============================================================================
// VIEW MANAGEMENT
// ============================================================================

function showQuizView(modelType) {
    const elements = getQuizElements();
    if (!elements.quizView || !elements.arContainer) return;

    // Hide AR view
    elements.arContainer.classList.add('hidden');
    
    // Hide AR-related buttons
    const resetButton = document.getElementById('reset-button');
    if (resetButton) resetButton.classList.add('hidden');
    const quizButton = document.getElementById('quiz-button');
    if (quizButton) quizButton.classList.add('hidden');

    // Show quiz view
    elements.quizView.classList.remove('hidden');
    
    // Render quiz
    renderQuiz(modelType);
}

function hideQuizView() {
    const elements = getQuizElements();
    if (!elements.quizView || !elements.arContainer) return;

    // Hide quiz view
    elements.quizView.classList.add('hidden');
    
    // Show AR view
    elements.arContainer.classList.remove('hidden');
    
    // Reset quiz state
    currentQuiz = null;
    currentQuestionIndex = 0;
    userAnswers = [];
    quizStarted = false;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Back to AR button
document.addEventListener('DOMContentLoaded', () => {
    const backButton = document.getElementById('back-to-ar-button');
    if (backButton) {
        backButton.addEventListener('click', () => {
            hideQuizView();
            // Restart AR session if needed
            if (window.ARController && window.ARController.init) {
                // Note: This will restart the AR session
                // You might want to handle this differently based on your needs
                console.log('Returning to AR view');
            }
        });
    }
});

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.QuizSystem = {
        showQuiz: showQuizView,
        hideQuiz: hideQuizView,
        renderQuiz: renderQuiz,
        getQuizData: (modelType) => quizData[modelType]
    };
}
