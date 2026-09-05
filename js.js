import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const DRAFT_KEY = 'open-when-letter-draft-v1';
const isRecipientPage = document.body.dataset.page === 'recipient';
const COLLECTION_NAME = 'letters';

function generateLetterId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `letter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultLetters = [
  {
    id: 'default-miss-me',
    recipient: 'You Miss Me',
    sender: 'Your person',
    occasion: 'Open when',
    message: 'When you miss me, I hope this letter reminds you that I am still here, in every warm thought, every quiet smile, and every place your heart reaches for mine. No matter how far apart we are, I am carrying you with me — in my heart, in my dreams, and in all the little moments that feel like home when you are near.',
    isDefault: true
  },
  {
    id: 'default-smile',
    recipient: 'You Need a Smile',
    sender: 'Your favorite person',
    occasion: 'Open when',
    message: 'I hope this is the little reminder you needed: you are loved more than you know, and there is a softness in your soul that makes the world brighter just by being in it. Smile, even if it is tiny. A smile is still a little spark of light, and you are the kind of light that makes other people feel less alone.',
    isDefault: true
  },
  {
    id: 'default-sad',
    recipient: 'You Feel Sad',
    sender: 'The one who loves you most',
    occasion: 'Open when',
    message: 'It is okay to feel sad sometimes. Even the strongest hearts need rest and gentleness. I hope you remember that you are never too much, never too difficult, and never alone. I will always be here, loving you in the quiet ways and the loudest ways, holding space for your feelings and cheering for your healing every day.',
    isDefault: true
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

function firebaseConfigIsReady() {
  return Boolean(
    firebaseConfig?.apiKey &&
    firebaseConfig?.projectId &&
    !String(firebaseConfig.apiKey).includes('PASTE_') &&
    !String(firebaseConfig.projectId).includes('PASTE_')
  );
}

function resizeMessageBox() {
  if (!letterInput) return;
  letterInput.style.height = 'auto';
  letterInput.style.height = `${letterInput.scrollHeight}px`;
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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createParagraphs(text = '') {
  return String(text)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function permanentRecipientUrl() {
  const sharePath = window.location.pathname.replace(/[^/]*$/, 'recipient.html');
  return `${window.location.origin}${sharePath}`;
}

function bindLetterCard(card) {
  const envelope = card.querySelector('.envelope');
  const button = card.querySelector('.envelope button');
  const copyLinkButton = card.querySelector('.copy-link');

  const toggleCard = () => {
    const isOpen = card.classList.contains('is-open');

    document.querySelectorAll('.letter-card').forEach((item) => {
      item.classList.remove('is-open');
      const itemButton = item.querySelector('.envelope button');
      if (itemButton) itemButton.textContent = 'Open letter';
    });

    if (!isOpen) {
      card.classList.add('is-open');
      if (button) button.textContent = 'Close letter';
    }
  };

  if (envelope) envelope.addEventListener('click', toggleCard);
  if (button) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCard();
    });
  }

  if (copyLinkButton && !isRecipientPage) {
    copyLinkButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(permanentRecipientUrl());
        copyLinkButton.textContent = 'Copied!';
      } catch (error) {
        copyLinkButton.textContent = 'Copy failed';
      }
      setTimeout(() => {
        copyLinkButton.textContent = 'Copy Recipient Link';
      }, 1200);
    });
  }
}

function buildLetterCard(letter) {
  const card = document.createElement('article');
  card.className = 'letter-card';
  card.dataset.letterId = letter.id || generateLetterId();

  const safeRecipient = (letter.recipient || 'My Love').trim() || 'My Love';
  const safeSender = (letter.sender || 'Your person').trim() || 'Your person';
  const safeOccasion = (letter.occasion || 'Open when').trim() || 'Open when';
  const safeMessage = (letter.message || 'I love you more than words could ever say.').trim() || 'I love you more than words could ever say.';

  const actionMarkup = isRecipientPage
    ? ''
    : '<div class="card-actions"><button type="button" class="copy-link">Copy Recipient Link</button></div>';

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

  bindLetterCard(card);
  return card;
}

function renderLetters(cloudLetters = []) {
  if (!lettersGrid) return;
  lettersGrid.innerHTML = '';

  const allLetters = [...cloudLetters, ...defaultLetters];
  allLetters.forEach((letter) => lettersGrid.appendChild(buildLetterCard(letter)));
}

function showCloudError(message) {
  if (storageStatus) storageStatus.textContent = message;
  if (isRecipientPage && lettersGrid) {
    const notice = document.createElement('p');
    notice.className = 'storage-status';
    notice.style.gridColumn = '1 / -1';
    notice.textContent = message;
    lettersGrid.prepend(notice);
  }
}

if (recipientPageLink) {
  recipientPageLink.href = 'recipient.html';
}

renderLetters([]);
restoreDraft();
resizeMessageBox();

if (!firebaseConfigIsReady()) {
  showCloudError('Firebase is not connected yet. Add your Firebase config in firebase-config.js.');
} else {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const lettersRef = collection(db, COLLECTION_NAME);
  const lettersQuery = query(lettersRef, orderBy('createdAt', 'desc'));

  onSnapshot(
    lettersQuery,
    (snapshot) => {
      const cloudLetters = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      renderLetters(cloudLetters);
      if (storageStatus) {
        storageStatus.textContent = 'Saved online. The recipient page updates automatically on other devices.';
      }
    },
    (error) => {
      console.error('Could not load Firebase letters:', error);
      showCloudError('Could not load online letters. Check your Firebase setup and Firestore rules.');
    }
  );

  if (letterForm) {
    letterForm.addEventListener('input', () => {
      resizeMessageBox();
      saveDraft();
    });

    letterForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const recipient = recipientInput.value.trim();
      const message = letterInput.value.trim();
      const sender = fromInput.value.trim();
      const occasion = occasionInput.value.trim();
      const submitButton = letterForm.querySelector('button[type="submit"]');

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';
      }
      if (storageStatus) storageStatus.textContent = 'Saving your letter online...';

      try {
        await addDoc(lettersRef, {
          recipient: recipient || 'My Love',
          sender: sender || 'Your person',
          occasion: occasion || 'Open when',
          message: message || 'I love you more than words could ever say.',
          createdAt: serverTimestamp()
        });

        localStorage.removeItem(DRAFT_KEY);
        letterForm.reset();
        recipientInput.value = 'My Love';
        resizeMessageBox();
        if (storageStatus) {
          storageStatus.textContent = 'Letter posted! It is now available on the recipient page.';
        }
      } catch (error) {
        console.error('Could not save letter:', error);
        if (storageStatus) {
          storageStatus.textContent = 'Could not save the letter. Check Firebase and Firestore permissions.';
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Seal the Letter 💌';
        }
      }
    });
  }
}
