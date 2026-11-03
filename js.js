const DRAFT_KEY = 'open-when-letter-draft-v1';
const isRecipientPage = document.body.dataset.page === 'recipient';
let firebaseSdk = null;
let currentUser = null;
let unsubscribeLetters = null;

function generateLetterId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `letter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const letterForm = document.getElementById('letterForm');
const recipientInput = document.getElementById('recipientInput');
const letterInput = document.getElementById('letterInput');
const fromInput = document.getElementById('fromInput');
const occasionInput = document.getElementById('occasionInput');
const lettersGrid = document.getElementById('lettersGrid');
const storageStatus = document.getElementById('storageStatus');
const recipientPageLink = document.getElementById('recipientPageLink');
const authStatus = document.getElementById('authStatus');
const authError = document.getElementById('authError');
const accountEmail = document.getElementById('accountEmail');
const signInButton = document.getElementById('signInButton');
const signOutButton = document.getElementById('signOutButton');

function resizeMessageBox() {
  if (!letterInput) return;

  letterInput.style.height = 'auto';
  letterInput.style.height = `${letterInput.scrollHeight}px`;
}

function normalizeLetters(list) {
  return list.map((letter) => ({
    ...letter,
    id: letter.id || generateLetterId(),
    recipient: letter.recipient || 'My Boss',
    sender: letter.sender || 'Your person',
    occasion: letter.occasion || 'Open when',
    message: letter.message || 'I love you more than words could ever say.'
  }));
}

function getSharedLetter() {
  const encodedLetter = new URLSearchParams(window.location.search).get('letter');

  if (!encodedLetter) return null;

  try {
    return normalizeLetters([JSON.parse(encodedLetter)])[0];
  } catch (error) {
    console.warn('Could not read shared letter:', error);
    return null;
  }
}

function getShareUrl(letter) {
  const sharePath = window.location.pathname.replace(/[^/]*$/, 'recipient.html');
  const plainLetter = {
    recipient: letter.recipient,
    sender: letter.sender,
    occasion: letter.occasion,
    message: letter.message
  };
  return `${window.location.origin}${sharePath}?letter=${encodeURIComponent(JSON.stringify(plainLetter))}`;
}

async function decompressText(encodedText) {
  if (!('DecompressionStream' in window)) return encodedText;

  const binary = atob(encodedText.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).text();
}

async function getSharedLetters() {
  const encodedLetters = new URLSearchParams(window.location.search).get('letters');

  if (!encodedLetters) return null;

  try {
    const decodedLetters = encodedLetters.trim().startsWith('[')
      ? encodedLetters
      : await decompressText(encodedLetters);
    const parsed = JSON.parse(decodedLetters);
    if (!Array.isArray(parsed)) return null;

    return normalizeLetters(parsed.map((letter) => {
      if (Array.isArray(letter)) {
        return {
          recipient: letter[0],
          sender: letter[1],
          occasion: letter[2],
          message: letter[3]
        };
      }

      return letter;
    }));
  } catch (error) {
    console.warn('Could not read shared letters:', error);
    return null;
  }
}

function saveDraft() {
  if (!letterForm) return;

  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    recipient: recipientInput.value,
    message: letterInput.value,
    sender: fromInput.value,
    occasion: occasionInput.value
  }));
}

function restoreDraft() {
  if (!letterForm) return;

  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!draft) return;

    recipientInput.value = draft.recipient || 'My Love';
    letterInput.value = draft.message || '';
    fromInput.value = draft.sender || '';
    occasionInput.value = draft.occasion || '';
  } catch (error) {
    console.warn('Could not restore draft:', error);
  }
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function bindLetterCard(card, letter) {
  const envelope = card.querySelector('.envelope');
  const button = card.querySelector('button');
  const copyLinkButton = card.querySelector('.copy-link');

  const toggleCard = () => {
    const isOpen = card.classList.contains('is-open');

    document.querySelectorAll('.letter-card').forEach((item) => {
      item.classList.remove('is-open');
      const itemButton = item.querySelector('button');
      if (itemButton) itemButton.textContent = 'Open letter';
    });

    if (!isOpen) {
      card.classList.add('is-open');
      if (button) button.textContent = 'Close letter';
    }
  };

  if (envelope) {
    envelope.addEventListener('click', toggleCard);
  }

  if (button) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCard();
    });
  }

  if (copyLinkButton && !isRecipientPage) {
    copyLinkButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const shareUrl = getShareUrl(letter);

      try {
        await navigator.clipboard.writeText(shareUrl);
        copyLinkButton.textContent = 'Copied!';
        setTimeout(() => {
          copyLinkButton.textContent = 'Copy Link';
        }, 1200);
      } catch (error) {
        copyLinkButton.textContent = 'Copy failed';
        setTimeout(() => {
          copyLinkButton.textContent = 'Copy Link';
        }, 1200);
      }
    });
  }
}

function buildLetterCard(letter) {
  const card = document.createElement('article');
  card.className = 'letter-card';
  card.dataset.letterId = letter.id;

  const safeRecipient = (letter.recipient || 'My Love').trim() || 'My Love';
  const safeSender = (letter.sender || 'Your person').trim() || 'Your person';
  const safeOccasion = (letter.occasion || 'Open when').trim() || 'Open when';
  const safeMessage = (letter.message || 'I love you more than words could ever say.').trim() || 'I love you more than words could ever say.';

  const actionMarkup = isRecipientPage
    ? ''
    : `<div class="card-actions"><button type="button" class="copy-link" data-letter-id="${escapeHtml(letter.id)}">Copy Link</button></div>`;

  card.innerHTML = `
    <div class="envelope">
      <div class="seal">❤</div>
      <div class="label-tag">${escapeHtml(safeOccasion)}</div>
      <h2>${escapeHtml(safeRecipient)}</h2>
      <button type="button">Open letter</button>
    </div>

    <div class="letter-content">
      <p>My dearest ${escapeHtml(safeRecipient)},</p>
      ${createParagraphs(safeMessage)}
      <p class="signature">With all my love,<br />${escapeHtml(safeSender)}</p>
    </div>

    ${actionMarkup}
  `;

  bindLetterCard(card, letter);
  return card;
}

function renderLetterCards(letters) {
  lettersGrid.innerHTML = '';

  letters.forEach((letter) => {
    lettersGrid.appendChild(buildLetterCard(letter));
  });
}

function setAuthError(message) {
  if (!authError) return;
  authError.textContent = message;
  authError.hidden = !message;
}

function setAuthStatus(message) {
  if (authStatus) authStatus.textContent = message;
}

function showGridMessage(message) {
  lettersGrid.innerHTML = `<p class="storage-status">${escapeHtml(message)}</p>`;
}

function lettersCollection() {
  return firebaseSdk.collection(firebaseSdk.db, 'letters');
}

function sortLetters(letters) {
  return letters.sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });
}

function startLettersListener() {
  if (unsubscribeLetters) unsubscribeLetters();

  unsubscribeLetters = firebaseSdk.onSnapshot(lettersCollection(), (snapshot) => {
    const letters = sortLetters(snapshot.docs.map((item) => ({
      ...item.data(),
      id: item.id
    })));

    if (!letters.length) {
      showGridMessage('No letters yet.');
    } else {
      renderLetterCards(normalizeLetters(letters));
    }

    if (storageStatus) {
      storageStatus.textContent = 'Letters are saved online and shown on the recipient page.';
    }
  }, (error) => {
    console.error('Could not load letters:', error);
    showGridMessage('The letters could not be loaded right now.');
    setAuthError(`Firebase error: ${error.message}`);
  });
}

function setupAuth() {
  if (signInButton) signInButton.disabled = false;

  firebaseSdk.onAuthStateChanged(firebaseSdk.auth, (user) => {
    currentUser = user;
    if (signInButton) signInButton.hidden = Boolean(user);
    if (signOutButton) signOutButton.hidden = !user;
    if (accountEmail) {
      accountEmail.hidden = !user;
      accountEmail.textContent = user ? user.email : '';
    }
    setAuthStatus(user
      ? `Signed in as ${user.email}. You can add new letters.`
      : 'Sign in with Google to add new letters.');
  }, (error) => {
    setAuthStatus('Firebase authentication could not be initialized.');
    setAuthError(error.message);
  });
}

async function initializeFirebase() {
  try {
    firebaseSdk = await import('./firebase.js');
  } catch (error) {
    console.error('Firebase could not be initialized:', error);
    showGridMessage('Firebase could not be loaded.');
    setAuthStatus('Firebase could not be initialized.');
    setAuthError(error.message);
    return;
  }

  startLettersListener();
  if (!isRecipientPage) setupAuth();
}

async function renderLetters() {
  const sharedLetter = getSharedLetter();
  const sharedLetters = await getSharedLetters();
  const linkLetters = sharedLetters?.length ? sharedLetters : (sharedLetter ? [sharedLetter] : null);

  if (linkLetters) {
    renderLetterCards(linkLetters);
    return;
  }

  showGridMessage('Loading letters...');
  initializeFirebase();
}

if (signInButton) {
  signInButton.addEventListener('click', async () => {
    setAuthError('');
    signInButton.disabled = true;
    try {
      await firebaseSdk.signInWithPopup(
        firebaseSdk.auth,
        new firebaseSdk.GoogleAuthProvider()
      );
    } catch (error) {
      setAuthError(error.message);
    } finally {
      signInButton.disabled = false;
    }
  });
}

if (signOutButton) {
  signOutButton.addEventListener('click', async () => {
    setAuthError('');
    signOutButton.disabled = true;
    try {
      await firebaseSdk.signOut(firebaseSdk.auth);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      signOutButton.disabled = false;
    }
  });
}

if (letterForm) {
  letterForm.addEventListener('input', () => {
    resizeMessageBox();
    saveDraft();
  });

  letterForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!currentUser) {
      setAuthStatus('Sign in with Google before saving a letter.');
      return;
    }

    const newLetter = {
      recipient: recipientInput.value.trim() || 'My Love',
      sender: fromInput.value.trim() || 'Your person',
      occasion: occasionInput.value.trim() || 'Open when',
      message: letterInput.value.trim() || 'I love you more than words could ever say.'
    };
    const newId = generateLetterId();

    const submitButton = letterForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setAuthError('');
    try {
      await firebaseSdk.setDoc(
        firebaseSdk.doc(firebaseSdk.db, 'letters', newId),
        { ...newLetter, createdAt: firebaseSdk.serverTimestamp() }
      );
      localStorage.removeItem(DRAFT_KEY);
      if (storageStatus) storageStatus.textContent = 'Saved online. It now shows on the recipient page.';
      letterForm.reset();
      recipientInput.value = 'My Love';
      letterInput.value = '';
      fromInput.value = '';
      occasionInput.value = '';
      resizeMessageBox();
    } catch (error) {
      setAuthError(`Could not save your letter: ${error.message}`);
    } finally {
      submitButton.disabled = false;
    }
  });
}

restoreDraft();
resizeMessageBox();

if (isRecipientPage) {
  renderLetters();
} else {
  showGridMessage('Loading letters...');
  initializeFirebase();
}
