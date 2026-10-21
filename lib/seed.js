// lib/seed.js — fills an empty vault with sample artists, works, comments,
// follows and opportunity calls so the site is alive the first time you run it.
// Everything seeded here is sample content (clearly sample accounts) meant for
// local previewing. Reset with:  npm run seed

const fs = require('fs');
const path = require('path');
const store = require('./store');
const wav = require('./wav');

const ROOT = path.join(__dirname, '..');
const UPLOADS = path.join(ROOT, 'uploads');

function daysAgo(n, hours = 0) {
  return new Date(Date.now() - n * 864e5 - hours * 36e5).toISOString();
}

function copyArtwork(filename) {
  fs.mkdirSync(UPLOADS, { recursive: true });
  const dest = path.join(UPLOADS, filename);
  fs.copyFileSync(path.join(ROOT, 'seed-media', filename), dest);
  return { filename, mime: 'image/svg+xml' };
}

function copyFile(filename, mime) {
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'seed-media', filename), path.join(UPLOADS, filename));
  return { filename, mime };
}

// avatars get their own copies so replacing a picture can never touch a post
function copyAvatar(filename, as) {
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'seed-media', filename), path.join(UPLOADS, as));
  return as;
}

function writeAudio(key, filename) {
  fs.mkdirSync(UPLOADS, { recursive: true });
  const { wav: buffer, peaks } = wav.render(wav.pieces[key]());
  fs.writeFileSync(path.join(UPLOADS, filename), buffer);
  return { filename, mime: 'audio/wav', peaks };
}

function seed() {
  // ---- artists ----------------------------------------------------------
  const U = (name, handle, year, bio, mod = false) => store.upsertUser({
    email: `${handle}@oberlin.edu`, name, classYear: year, isModerator: mod
  });
  const maya = U('Maya Okonkwo', 'mokonkwo', "'27", 'Photography & TIMARA double. Mostly golden hour, mostly Ohio. / I shoot the things I am afraid to say out loud.');
  const theo = U('Theo Ramirez', 'tramirez', "'26", 'Film production. I make illustrations to rest my eyes between edits.');
  const priya = U('Priya Shah', 'pshah', "'25", 'Cinema studies senior. Thesis film in progress: "Glasshouse". Prose on weekends.');
  const june = U('June Park', 'jpark', "'28", 'Printmaking + piano. Risograph evangelist. First-year.');
  const jonah = U('Jonah Weiss', 'jweiss', "'26", 'Sound design, tape loops, occasional paint. If it hums, I recorded it.');
  const amara = U('Amara Diallo', 'adiallo', "'25", 'Theater & textiles. I sew the stories I can\u2019t stage yet.');
  const sam = U('Sam Lindqvist', 'slindqvist', "'27", 'ObVault collective: I help keep the shelves tidy. Design & books.', true);
  const ren = U('Ren Takahashi', 'rtakahashi', "'26", 'Dance & contact improv. Notes on movement, mostly for me.');

  // ---- profile pictures (a couple of samples use their own artwork) -------
  maya.avatarFile = copyAvatar('field.svg', 'avatar-maya.svg');
  theo.avatarFile = copyAvatar('still-life.svg', 'avatar-theo.svg');

  // ---- follows ----------------------------------------------------------
  [[maya, theo], [maya, june], [theo, priya], [priya, maya], [june, jonah],
   [jonah, maya], [amara, priya], [amara, june], [sam, maya], [sam, theo],
   [ren, amara], [theo, june], [june, amara], [priya, jonah]].forEach(([a, b]) => {
    store.toggleFollow(a.id, b.id);
  });

  // ---- works ------------------------------------------------------------
  const P = (user, data) => store.createPost({ userId: user.id, ...data });

  P(maya, { kind: 'image', title: 'Trestle, evening', category: 'Photography', description: 'The old rail bridge behind the practice rooms. Shot on expired film: the magenta leak felt honest.', tags: ['35mm', 'ohio', 'expired film'], media: copyArtwork('trestle.svg'), createdAt: daysAgo(1, 3) });
  P(theo, { kind: 'image', title: 'Still life with cassette & ivy', category: 'Illustration', description: 'My desk, if my desk were tidier and drawn in four colors.', tags: ['illustration', 'desk'], media: copyArtwork('still-life.svg'), createdAt: daysAgo(2, 7) });
  P(maya, { kind: 'image', title: 'Self, double exposure', category: 'Photography', description: 'Portrait assignment. Two versions of me on one frame: the one who stayed and the one who left.', tags: ['portrait', 'double exposure'], media: copyArtwork('double.svg'), createdAt: daysAgo(4, 2) });
  P(priya, { kind: 'image', title: 'Interior, 3 a.m.', category: 'Film & Video', description: 'Frame grab from thesis shoot night four. We were all delirious and the light was perfect.', tags: ['thesis', 'still'], media: copyArtwork('interior-3am.svg'), createdAt: daysAgo(5, 11) });
  P(june, { kind: 'image', title: 'Riso study no. 4', category: 'Printmaking', description: 'Three passes, misregistered on purpose. Blue and red make that muddy plum I keep chasing.', tags: ['riso', 'print'], media: copyArtwork('riso-04.svg'), createdAt: daysAgo(6, 4) });
  P(jonah, { kind: 'image', title: 'Ridgelines (study for tape loop)', category: 'Drawing', description: 'I draw the waveform I want before I try to build it. These ridges hum at about 84 bpm.', tags: ['drawing', 'waveform'], media: copyArtwork('ridgelines.svg'), createdAt: daysAgo(7, 9) });
  P(amara, { kind: 'image', title: 'The Seagull: poster', category: 'Theater & Plays', description: 'Poster study for our fall translation. Chekhov deserves warmer reds than he usually gets.', tags: ['poster', 'theater'], media: copyArtwork('play-poster.svg'), createdAt: daysAgo(8, 6) });
  P(jonah, { kind: 'image', title: 'Anatomy of a chord', category: 'Painting', description: 'What an A minor looks like from the inside, if you ask me.', tags: ['painting', 'music'], media: copyArtwork('chord-anatomy.svg'), createdAt: daysAgo(10, 1) });
  P(priya, { kind: 'image', title: 'Contact sheet, roll 12', category: 'Film & Video', description: 'Developed the B-roll in my bathroom. Six frames worth keeping, maybe.', tags: ['film', 'contact sheet'], media: copyArtwork('contact-sheet.svg'), createdAt: daysAgo(12, 8) });
  P(june, { kind: 'image', title: 'Dorm recipes: a zine spread', category: 'Design', description: 'Spread from the winter term zine. Edition of 40, printed on the studio riso at 2 a.m.', tags: ['zine', 'riso'], media: copyArtwork('zine-spread.svg'), createdAt: daysAgo(14, 3) });
  P(theo, { kind: 'image', title: 'Hand study (left, holding coffee)', category: 'Drawing', description: 'Warmups before storyboarding. The hand never sits still long enough.', tags: ['study', 'ink'], media: copyArtwork('hand-study.svg'), createdAt: daysAgo(17, 5) });
  P(amara, { kind: 'image', title: 'Grandmother\u2019s garden, remixed', category: 'Textiles', description: 'English paper piecing with my grandmother\u2019s palette and my roommate\u2019s old shirts.', tags: ['quilt', 'textiles'], media: copyArtwork('quilt.svg'), createdAt: daysAgo(20, 2) });
  P(maya, { kind: 'image', title: 'Field behind Noah\u2019s, February', category: 'Photography', description: 'The flattest place I know. The power lines are the only characters.', tags: ['landscape', 'winter'], media: copyArtwork('field.svg'), createdAt: daysAgo(23, 7) });

  P(june, { kind: 'audio', title: 'Piano \u00e9tude no. 3 (home recording)', category: 'Music', description: 'Recorded on the landing with the hall phone ringing. I left it in.', tags: ['piano', 'etude'], media: writeAudio('etude', 'seed-etude.wav'), createdAt: daysAgo(3, 6) });
  P(jonah, { kind: 'audio', title: 'Study for tape loops', category: 'Sound & Audio Art', description: 'A drone, a melody, and the sound of the machine itself deciding things.', tags: ['tape', 'drone'], media: writeAudio('tapeLoop', 'seed-tapeloop.wav'), createdAt: daysAgo(9, 4) });
  P(theo, { kind: 'audio', title: 'Practice room voice memo', category: 'Music', description: 'Melody ideas between classes. Timing imperfect on purpose (and also not).', tags: ['voice memo', 'pentatonic'], media: writeAudio('practice', 'seed-practice.wav'), createdAt: daysAgo(15, 10) });

  P(amara, { kind: 'pdf', title: 'The Greenhouse: a one-act (excerpt)', category: 'Theater & Plays', description: 'Full excerpt from the winter workshop draft. Swipe through sideways. Notes welcome, especially on the fern.', tags: ['play', 'one-act', 'script'], media: copyFile('greenhouse-script.pdf', 'application/pdf'), createdAt: daysAgo(3, 9) });
  P(priya, { kind: 'text', title: 'From a notebook marked "thesis"', category: 'Prose', description: 'There is a version of this film where nothing happens, and it is the truest one. A house in the afternoon. Dust doing its slow arithmetic in the light. A girl rehearsing a goodbye she has not scheduled yet. I keep filming doors because doors know more than characters do.', tags: ['prose', 'notebook'], createdAt: daysAgo(11, 3) });
  P(amara, { kind: 'text', title: 'Sewing instructions, for a storm', category: 'Poetry', description: 'Thread the needle with the color of the sky\nbefore it makes up its mind.\nSew the hem twice: storms respect\nnothing less than repetition.\nWhen the thunder starts, backstitch.\nHold the fabric taut, like a sail,\nlike a thing that could leave.\nFinish the seam and bury the knot\nwhere no one will find it,\nthe way my grandmother taught me\nto hide the strengthening.', tags: ['poetry', 'textiles'], createdAt: daysAgo(13, 8) });
  P(ren, { kind: 'text', title: 'Contact improv notes, week 4', category: 'Dance', description: 'Give weight slowly, the way you would lend someone a book you love.: The point of contact is a question, not a statement.: When in doubt, lower your center and listen with the back.: Falling is just dancing that found a floor.', tags: ['improv', 'notes'], createdAt: daysAgo(16, 5) });
  P(theo, { kind: 'text', title: 'One-act excerpt: "Vending Machine, 2 a.m."', category: 'Theater & Plays', description: 'MARCUS. The machine ate my dollar.\n\nA LONG PAUSE. SOMEWHERE, A HUMIDIFIER.\n\nJUNE. Machines are just lonely people who got a job.\n\nMARCUS. Is that from something?\n\nJUNE. It is now.\n\nHE PUTS HIS FOREHEAD AGAINST THE GLASS. THE LIGHTS SHIFT, JUST BARELY, TOWARD DAWN.', tags: ['theater', 'one-act'], createdAt: daysAgo(18, 9) });

  // ---- comments ---------------------------------------------------------
  const C = (user, postTitle, body, d) => {
    const p = store.posts().find((x) => x.title === postTitle);
    if (p) {
      const c = store.addComment(p.id, user.id, body);
      c.createdAt = daysAgo(d[0], d[1]);
    }
  };
  C(june, 'Trestle, evening', 'That magenta leak is doing more character work than most protagonists.', [0, 20]);
  C(theo, 'Trestle, evening', 'Saving this for color reference on the thesis. Hope that\u2019s okay.', [1, 2]);
  C(maya, 'Still life with cassette & ivy', 'The tape between the reels!! Perfect detail.', [1, 5]);
  C(jonah, 'Piano \u00e9tude no. 3 (home recording)', 'The phone ringing at 1:12 is the best chord in the piece.', [2, 12]);
  C(priya, 'Piano \u00e9tude no. 3 (home recording)', 'Play this at my funeral or my wedding, whichever comes first.', [2, 9]);
  C(amara, 'Interior, 3 a.m.', 'This frame is why we make movies. Delirium looks like budget you didn\u2019t have.', [3, 4]);
  C(maya, 'Riso study no. 4', 'The plum!! You found it!!', [5, 6]);
  C(ren, 'Ridgelines (study for tape loop)', 'Read this as a dance score. Might teach it exactly as drawn.', [6, 14]);
  C(june, 'The Seagull: poster', 'Chekhov but make it warm: obsessed.', [7, 3]);
  C(sam, 'Anatomy of a chord', 'Hanging this in the print lab if you\u2019ll allow it.', [9, 8]);
  C(maya, 'Anatomy of a chord', 'Always. It belongs in a shared space.', [9, 2]);
  C(theo, 'Contact sheet, roll 12', 'Frame five is a whole short film.', [11, 6]);
  C(priya, 'Dorm recipes: a zine spread', 'The chili oil, gifted. TRUE. Save me edition no. 41.', [13, 4]);
  C(jonah, 'Sewing instructions, for a storm', 'Read this out loud and now my room is quieter somehow.', [12, 3]);
  C(june, 'Hand study (left, holding coffee)', 'The knuckle marks. Your linework is so unbothered, in a good way.', [16, 1]);

  // ---- likes ------------------------------------------------------------
  const likePairs = [
    ['Trestle, evening', [june, theo, priya, jonah, sam]],
    ['Piano \u00e9tude no. 3 (home recording)', [jonah, priya, maya, amara]],
    ['Interior, 3 a.m.', [maya, theo, amara, june]],
    ['Riso study no. 4', [maya, amara, sam, theo]],
    ['Still life with cassette & ivy', [maya, june, priya]],
    ['Self, double exposure', [theo, june, ren]],
    ['The Seagull: poster', [june, priya, sam, maya]],
    ['Anatomy of a chord', [maya, june, ren, sam]],
    ['Sewing instructions, for a storm', [jonah, june, priya, maya, ren]],
    ['Contact sheet, roll 12', [maya, june]],
    ['Dorm recipes: a zine spread', [priya, amara, jonah]],
    ['Ridgelines (study for tape loop)', [ren, june, priya]],
    ['From a notebook marked "thesis"', [amara, theo, june]],
    ['Hand study (left, holding coffee)', [june, maya]],
    ['Field behind Noah\u2019s, February', [sam, ren, june]],
    ['Study for tape loops', [june, theo, maya]],
    ['One-act excerpt: "Vending Machine, 2 a.m."', [priya, amara, sam]],
    ['Contact improv notes, week 4', [amara, jonah]]
  ];
  likePairs.forEach(([title, fans]) => {
    const p = store.posts().find((x) => x.title === title);
    if (p) fans.forEach((f) => store.toggleLike(p.id, f.id));
  });

  // ---- opportunity calls -------------------------------------------------
  store.createOpportunity({ userId: priya.id, title: 'ACTORS WANTED: senior thesis film "Glasshouse"', body: 'Shooting a 12-minute 16mm short in and around an off-campus house. Story: two siblings sort their late mother\u2019s greenhouse over one long afternoon. Quiet, dialogue-light, lots of held looks. No experience needed: just availability and patience.', type: 'casting', roles: ['Lead sibling #1 (any gender)', 'Lead sibling #2 (any gender)', 'Hands / insert shots'], deadline: 'Nov 30', contact: 'pshah@oberlin.edu', createdAt: daysAgo(1, 2) });
  store.createOpportunity({ userId: june.id, title: 'Cover artists wanted: first-year zine, winter issue', body: 'The "Mud Season" zine needs three covers and a back-page comic. Riso access included (I will teach you, it takes ten minutes). Theme: what the library smells like in February.', type: 'collaboration', roles: ['Cover artists', 'Back-page cartoonist'], deadline: 'Dec 8', contact: 'jpark@oberlin.edu', createdAt: daysAgo(3, 5) });
  store.createOpportunity({ userId: sam.id, title: 'Open call: spring exhibition "Memory in a Drawer"', body: 'The vault\u2019s first physical show, in the corridor gallery outside the print lab. Any medium, any year, alumni welcome. Works about keepsakes, junk drawers, and the things we keep without deciding to.', type: 'exhibition', roles: ['Artists: all mediums'], deadline: 'Jan 15', contact: 'slindqvist@oberlin.edu', createdAt: daysAgo(6, 1) });
  store.createOpportunity({ userId: jonah.id, title: 'Drummer (or very brave percussionist) wanted', body: 'Jazz-fusion trio of sound-design nerds seeks a drummer who can play a room, not just a beat. We rehearse Tuesdays in Tank 7. There will be tape loops. There will be snacks.', type: 'collaboration', roles: ['Drummer / percussionist'], deadline: 'Rolling', contact: 'jweiss@oberlin.edu', createdAt: daysAgo(8, 3) });
  store.createOpportunity({ userId: sam.id, title: 'Paid mural: DeCaf\u00e9 east wall', body: 'The co-op wants a seasonal mural on the east wall (paint provided, scaffolding provided, soup provided). Proposals: one sketch plus one sentence on what it means. Chosen by vote of everyone who works a shift that week.', type: 'employment', roles: ['Muralist'], deadline: 'Nov 20', contact: 'slindqvist@oberlin.edu', createdAt: daysAgo(12, 6) });

  store.save();
  console.log('Seeded the vault with', store.users().length, 'artists and', store.posts().length, 'works.');
}

function seedIfEmpty() {
  if (store.users().length === 0) seed();
}

// run directly:  node lib/seed.js --force   (wipes and re-seeds the vault)
if (require.main === module) {
  store.load();
  if (process.argv.includes('--force')) {
    fs.rmSync(store.DB_FILE, { force: true });
    fs.rmSync(UPLOADS, { recursive: true, force: true });
    store.load();
    console.log('Cleared the vault. Re-seeding...');
    seed();
  } else {
    seedIfEmpty();
  }
}

module.exports = { seed, seedIfEmpty };
