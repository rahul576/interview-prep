// Static metadata: levels, roles (categories), positions and interviewer personas.
// All personas are fictional.

export const LEVELS = [
  { id: 'entry',  rank: 1, label: 'Entry / Fresher', years: '0–2 yrs', minYears: 0 },
  { id: 'mid',    rank: 2, label: 'Mid-level',       years: '2–5 yrs', minYears: 2 },
  { id: 'senior', rank: 3, label: 'Senior',          years: '5–8 yrs', minYears: 5 },
  { id: 'lead',   rank: 4, label: 'Lead / Architect', years: '8+ yrs', minYears: 8 },
];

export const LEVEL_IDS = LEVELS.map(l => l.id);

/** Map years of experience to a level id. */
export function levelFromYears(years) {
  const y = Number(years) || 0;
  let found = LEVELS[0];
  for (const l of LEVELS) if (y >= l.minYears) found = l;
  return found.id;
}

export function levelById(id) {
  return LEVELS.find(l => l.id === id) || LEVELS[0];
}

export const CATEGORIES = [
  {
    id: 'java-backend',
    title: 'Java Backend Developer',
    short: 'Java Backend',
    blurb: 'Core Java, collections, concurrency, JVM, Spring Boot, JPA, REST, microservices, Kafka and system design.',
    accent: '#e76f2e',
    icon: 'java',
    positions: [
      { id: 'java-junior', title: 'Junior Java Developer', level: 'entry' },
      { id: 'java-backend', title: 'Java Backend Engineer', level: 'mid' },
      { id: 'java-senior', title: 'Senior Java Backend Engineer', level: 'senior' },
      { id: 'java-lead', title: 'Java Tech Lead / Architect', level: 'lead' },
    ],
  },
  {
    id: 'devops',
    title: 'DevOps Engineer',
    short: 'DevOps',
    blurb: 'Linux, networking, Git, CI/CD, Docker, Kubernetes, Terraform, AWS, observability, SRE and DevSecOps.',
    accent: '#2a7de1',
    icon: 'devops',
    positions: [
      { id: 'devops-junior', title: 'Junior DevOps Engineer', level: 'entry' },
      { id: 'devops-eng', title: 'DevOps Engineer', level: 'mid' },
      { id: 'devops-senior', title: 'Senior DevOps / SRE', level: 'senior' },
      { id: 'devops-lead', title: 'DevOps Lead / Platform Architect', level: 'lead' },
    ],
  },
];

export function categoryById(id) {
  return CATEGORIES.find(c => c.id === id);
}

// Interviewer portraits are AI-generated images supplied by the project owner (not real people).
// `face` holds pixel landmarks in the 500x500 photo so the photo can talk (jaw, mouth, blinks).
export const INTERVIEWERS = [
  {
    id: 'ananya', name: 'Ananya Rao', title: 'Engineering Manager', gender: 'female', photo: 'img/interviewers/ananya.jpg',
    // V1.11: real video loops made from her portrait with LivePortrait (see docs/interviewer-video.md)
    clips: { listen: 'img/interviewers/ananya-listen', talk: 'img/interviewers/ananya-talk' }, // .mp4 (H.264) and .webm (VP9)
  },
  {
    id: 'vikram', name: 'Vikram Mehta', title: 'Principal Engineer', gender: 'male', photo: 'img/interviewers/vikram.jpg',
    face: { mouth: { x: 252, y: 271, w: 74, upper: 7 }, chin: 330, neckEnd: 372, jaw: { x0: 176, x1: 330 }, maxOpen: 7,
      eyes: [{ x: 214, y: 192, w: 30, h: 12 }, { x: 298, y: 194, w: 30, h: 12 }] },
  },
  { id: 'daniel', name: 'Daniel Hughes', title: 'Head of Engineering', gender: 'male', photo: 'img/interviewers/daniel.jpg' },
  { id: 'priya', name: 'Priya Nair', title: 'HR Business Partner', gender: 'female', photo: 'img/interviewers/priya.jpg' },
  { id: 'minjun', name: 'Min-jun Park', title: 'Staff Software Engineer', gender: 'male', photo: 'img/interviewers/minjun.jpg' },
  { id: 'sarah', name: 'Sarah Collins', title: 'Senior Technical Recruiter', gender: 'female', photo: 'img/interviewers/sarah.jpg' },
];

export function interviewerById(id) {
  return INTERVIEWERS.find(i => i.id === id) || INTERVIEWERS[0];
}
