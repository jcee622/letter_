const STORAGE_KEY = 'open-when-letters-v1';
const DRAFT_KEY = 'open-when-letter-draft-v1';
const isRecipientPage = document.body.dataset.page === 'recipient';
let firebaseSdk = null;
let currentUser = null;
let cloudReady = false;
let activeLetters = [];
let unsubscribeLetters = null;

function generateLetterId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `letter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultLetters = [
  {
    id: 'default-miss-you',
    recipient: 'You Miss Me',
    sender: 'Your person',
    occasion: 'Open when',
    message: 'When you miss me, I hope this letter reminds you that I am still here, in every warm thought, every quiet smile, and every place your heart reaches for mine. No matter how far apart we are, I am carrying you with me — in my heart, in my dreams, and in all the little moments that feel like home when you are near.'
  },
  {
    id: 'default-need-a-smile',
    recipient: 'You Need a Smile',
    sender: 'Your favorite person',
    occasion: 'Open when',
    message: 'I hope this is the little reminder you needed: you are loved more than you know, and there is a softness in your soul that makes the world brighter just by being in it. Smile, even if it is tiny. A smile is still a little spark of light, and you are the kind of light that makes other people feel less alone.'
  },
  {
    id: 'default-feel-sad',
    recipient: 'You Feel Sad',
    sender: 'The one who loves you most',
    occasion: 'Open when',
    message: 'It is okay to feel sad sometimes. Even the strongest hearts need rest and gentleness. I hope you remember that you are never too much, never too difficult, and never alone. I will always be here, loving you in the quiet ways and the loudest ways, holding space for your feelings and cheering for your healing every day.'
  }
];

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

function getStoredLetters() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) {
        const storedLetters = normalizeLetters(parsed);
        const missingDefaults = defaultLetters.filter((defaultLetter) => (
          !storedLetters.some((letter) => letter.recipient === defaultLetter.recipient)
        ));
        const letters = [...storedLetters, ...normalizeLetters(missingDefaults)];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(letters));
        return letters;
      }
    } catch (error) {
      console.warn('Could not read saved letters:', error);
    }
  }

  const letters = normalizeLetters(defaultLetters);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(letters));
  return letters;
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
  return `${window.location.origin}${sharePath}?letter=${encodeURIComponent(JSON.stringify(letter))}`;
}

async function compressText(text) {
  if (!('CompressionStream' in window)) return text;

  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decompressText(encodedText) {
  if (!('DecompressionStream' in window)) return encodedText;

  const binary = atob(encodedText.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).text();
}

async function getLettersShareUrl(letters) {
  const sharePath = window.location.pathname.replace(/[^/]*$/, 'recipient.html');
  const compactLetters = letters.map((letter) => [
    letter.recipient,
    letter.sender,
    letter.occasion,
    letter.message
  ]);
  let encodedLetters;
  try {
    encodedLetters = await compressText(JSON.stringify(compactLetters));
  } catch (error) {
    encodedLetters = JSON.stringify(compactLetters);
  }
  return `${window.location.origin}${sharePath}?letters=${encodeURIComponent(encodedLetters)}`;
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

async function renderLetters() {
  const sharedLetter = isRecipientPage ? getSharedLetter() : null;
  const sharedLetters = isRecipientPage ? await getSharedLetters() : null;
  const letters = sharedLetters?.length
    ? sharedLetters
    : (sharedLetter ? [sharedLetter] : getStoredLetters());
  renderLetterCards(letters);
}

function renderLetterCards(letters) {
  lettersGrid.innerHTML = '';

  letters.forEach((letter) => {
    lettersGrid.appendChild(buildLetterCard(letter));
  });
}

function updateRecipientPageLink(letters) {
  if (!recipientPageLink || !letters.length) return;

  getLettersShareUrl(letters)
    .then((shareUrl) => {
      recipientPageLink.href = shareUrl;
    })
    .catch((error) => {
      console.error('Could not create the recipient page link:', error);
      if (storageStatus) storageStatus.textContent = 'Letters are saved, but the recipient link could not be created.';
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

function lettersCollection(uid) {
  return firebaseSdk.collection(firebaseSdk.db, 'users', uid, 'letters');
}

function sortLetters(letters) {
  return letters.sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });
}

async function writeInitialLetters(uid, letters) {
  const batch = firebaseSdk.writeBatch(firebaseSdk.db);
  letters.forEach((letter) => {
    batch.set(firebaseSdk.doc(firebaseSdk.db, 'users', uid, 'letters', letter.id), {
      ...letter,
      createdAt: firebaseSdk.serverTimestamp()
    });
  });
  await batch.commit();
}

async function loadUserLetters(user) {
  cloudReady = false;
  setAuthError('');
  setAuthStatus('Loading your letters from Firebase...');

  try {
    const collectionRef = lettersCollection(user.uid);
    const snapshot = await firebaseSdk.getDocs(collectionRef);
    if (currentUser?.uid !== user.uid) return;

    if (snapshot.empty) {
      const localLetters = getStoredLetters();
      await writeInitialLetters(user.uid, localLetters);
      localStorage.removeItem(STORAGE_KEY);
    } else {
      const savedLetters = snapshot.docs.map((item) => ({
        ...item.data(),
        id: item.id
      }));
      const missingDefaults = defaultLetters.filter((defaultLetter) => (
        !savedLetters.some((letter) => letter.recipient === defaultLetter.recipient)
      ));
      if (missingDefaults.length) {
        await writeInitialLetters(user.uid, normalizeLetters(missingDefaults));
      }
      localStorage.removeItem(STORAGE_KEY);
    }

    if (currentUser?.uid !== user.uid) return;
    unsubscribeLetters = firebaseSdk.onSnapshot(collectionRef, (updatedSnapshot) => {
      activeLetters = sortLetters(updatedSnapshot.docs.map((item) => ({
        ...item.data(),
        id: item.id
      })));
      cloudReady = true;
      renderLetterCards(activeLetters);
      updateRecipientPageLink(activeLetters);
      setAuthStatus(`Signed in as ${user.email}. Your letters sync with Firebase.`);
      if (storageStatus) {
        storageStatus.textContent = 'Letters are saved in your Firebase account and sync across your devices.';
      }
    }, (error) => {
      cloudReady = false;
      setAuthStatus('Firebase could not load your letters.');
      setAuthError(error.message);
    });
  } catch (error) {
    cloudReady = false;
    setAuthStatus('Firebase could not load your letters.');
    setAuthError(error.message);
  }
}

async function initializeFirebase() {
  try {
    firebaseSdk = await import('./firebase.js');
    if (signInButton) signInButton.disabled = false;
    firebaseSdk.onAuthStateChanged(firebaseSdk.auth, (user) => {
      if (unsubscribeLetters) {
        unsubscribeLetters();
        unsubscribeLetters = null;
      }
      currentUser = user;
      cloudReady = false;
      if (signInButton) signInButton.hidden = Boolean(user);
      if (signOutButton) signOutButton.hidden = !user;
      if (accountEmail) {
        accountEmail.hidden = !user;
        accountEmail.textContent = user ? user.email : '';
      }

      if (!user) {
        activeLetters = getStoredLetters();
        renderLetterCards(activeLetters);
        updateRecipientPageLink(activeLetters);
        setAuthStatus('Sign in with Google to sync your letters across devices.');
        if (storageStatus) {
          storageStatus.textContent = 'Sign in with Google to save letters to Firebase and sync them across devices.';
        }
        return;
      }

      loadUserLetters(user);
    }, (error) => {
      setAuthStatus('Firebase authentication could not be initialized.');
      setAuthError(error.message);
    });
  } catch (error) {
    setAuthStatus('Firebase could not be initialized.');
    setAuthError(error.message);
  }
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

    if (!currentUser || !cloudReady) {
      setAuthStatus('Sign in with Google and wait for your letters to load before saving.');
      return;
    }

    const recipient = recipientInput.value.trim();
    const message = letterInput.value.trim();
    const sender = fromInput.value.trim();
    const occasion = occasionInput.value.trim();

    const newLetter = {
      id: generateLetterId(),
      recipient: recipient || 'My Love',
      sender: sender || 'Your person',
      occasion: occasion || 'Open when',
      message: message || 'I love you more than words could ever say.'
    };

    const submitButton = letterForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      await firebaseSdk.setDoc(
        firebaseSdk.doc(firebaseSdk.db, 'users', currentUser.uid, 'letters', newLetter.id),
        { ...newLetter, createdAt: firebaseSdk.serverTimestamp() }
      );
      localStorage.removeItem(DRAFT_KEY);
      if (storageStatus) storageStatus.textContent = 'Saved to Firebase. Use Copy Link to share a letter.';
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

if (isRecipientPage) {
  renderLetters();
} else {
  activeLetters = getStoredLetters();
  renderLetterCards(activeLetters);
  updateRecipientPageLink(activeLetters);
}
restoreDraft();
resizeMessageBox();

if (!isRecipientPage) initializeFirebase();
