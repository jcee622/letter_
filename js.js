const STORAGE_KEY = 'open-when-letters-v1';
const DRAFT_KEY = 'open-when-letter-draft-v1';
const isRecipientPage = document.body.dataset.page === 'recipient';

function generateLetterId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `letter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultLetters = [
  {
    id: generateLetterId(),
    recipient: 'You Miss Me',
    sender: 'Your person',
    occasion: 'Open when',
    message: 'When you miss me, I hope this letter reminds you that I am still here, in every warm thought, every quiet smile, and every place your heart reaches for mine. No matter how far apart we are, I am carrying you with me — in my heart, in my dreams, and in all the little moments that feel like home when you are near.'
  },
  {
    id: generateLetterId(),
    recipient: 'You Need a Smile',
    sender: 'Your favorite person',
    occasion: 'Open when',
    message: 'I hope this is the little reminder you needed: you are loved more than you know, and there is a softness in your soul that makes the world brighter just by being in it. Smile, even if it is tiny. A smile is still a little spark of light, and you are the kind of light that makes other people feel less alone.'
  },
  {
    id: generateLetterId(),
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

function saveLetters(letters) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLetters(letters)));
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
  lettersGrid.innerHTML = '';

  letters.forEach((letter) => {
    lettersGrid.appendChild(buildLetterCard(letter));
  });
}

if (letterForm) {
  letterForm.addEventListener('input', () => {
    resizeMessageBox();
    saveDraft();
  });

  letterForm.addEventListener('submit', (event) => {
    event.preventDefault();

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

    const currentLetters = getStoredLetters();
    currentLetters.unshift(newLetter);
    saveLetters(currentLetters);
    localStorage.removeItem(DRAFT_KEY);
    if (recipientPageLink) {
      getLettersShareUrl(currentLetters).then((shareUrl) => {
        recipientPageLink.href = shareUrl;
      });
    }
    if (storageStatus) storageStatus.textContent = 'Saved here. Use Copy Link to open this letter on another device.';
    renderLetters();

    letterForm.reset();
    recipientInput.value = 'My Love';
    letterInput.value = '';
    fromInput.value = '';
    occasionInput.value = '';
    resizeMessageBox();
  });
}

renderLetters();
restoreDraft();
resizeMessageBox();

if (recipientPageLink) {
  const savedLetters = getStoredLetters();
  if (savedLetters.length) {
    getLettersShareUrl(savedLetters).then((shareUrl) => {
      recipientPageLink.href = shareUrl;
    });
  }
}
