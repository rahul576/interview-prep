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

export const INTERVIEWERS = [
  {
    id: 'ananya',
    name: 'Ananya Rao',
    title: 'Engineering Manager',
    gender: 'female',
    look: { skin: '#c68863', skinShade: '#a96e4c', hair: '#1d1512', hairStyle: 'long', shirt: '#2f4a6d', eyes: '#3a2416', lips: '#a4524a', glasses: false },
  },
  {
    id: 'vikram',
    name: 'Vikram Mehta',
    title: 'Principal Engineer',
    gender: 'male',
    look: { skin: '#b97a55', skinShade: '#9a603f', hair: '#16110e', hairStyle: 'short', shirt: '#3c4f3a', eyes: '#2b1a10', lips: '#8e4a3e', glasses: true, beard: true },
  },
  {
    id: 'sarah',
    name: 'Sarah Collins',
    title: 'Senior Technical Recruiter',
    gender: 'female',
    look: { skin: '#f0c9a8', skinShade: '#d9a982', hair: '#7a4a24', hairStyle: 'bob', shirt: '#6b2f4a', eyes: '#3d5a73', lips: '#b65d5d', glasses: false },
  },
];

export function interviewerById(id) {
  return INTERVIEWERS.find(i => i.id === id) || INTERVIEWERS[0];
}
