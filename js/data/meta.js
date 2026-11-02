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
    id: 'ananya', name: 'Ananya Rao', title: 'Engineering Manager', gender: 'female',
    look: { skin: '#c68863', skinShade: '#a96e4c', hair: '#2a1d17', hairStyle: 'long', shirt: '#2f4566', blouse: '#a9c7e8', eyes: '#3a2416', lips: '#a4524a', glasses: true, glassesColor: '#3b2a22', necklace: true },
  },
  {
    id: 'vikram', name: 'Vikram Mehta', title: 'Principal Engineer', gender: 'male',
    look: { skin: '#b97a55', skinShade: '#9a603f', hair: '#16110e', hairStyle: 'short', shirt: '#6f747c', blouse: '#f3f5f8', tie: '#25365c', eyes: '#2b1a10', lips: '#8e4a3e', glasses: true, beard: true },
  },
  {
    id: 'sarah', name: 'Sarah Collins', title: 'Senior Technical Recruiter', gender: 'female',
    look: { skin: '#f0c9a8', skinShade: '#d9a982', hair: '#8a5a32', hairStyle: 'bob', shirt: '#55708f', blouse: '#9fbde0', eyes: '#3d5a73', lips: '#c0605c', glasses: true, glassesColor: '#111111' },
  },
  {
    id: 'daniel', name: 'Daniel Okafor', title: 'Head of Engineering', gender: 'male',
    look: { skin: '#7a4a32', skinShade: '#5e3624', hair: '#120c09', hairStyle: 'short', shirt: '#80848b', blouse: '#e9eef5', tie: '#2d3b63', eyes: '#1d120c', lips: '#6e3a2e' },
  },
  {
    id: 'minjun', name: 'Min-jun Park', title: 'Staff Software Engineer', gender: 'male',
    look: { skin: '#eac5a0', skinShade: '#cfa47c', hair: '#14110f', hairStyle: 'short', shirt: '#e6e9ee', blouse: '#ffffff', eyes: '#24170f', lips: '#b06a5c', glasses: true, glassesColor: '#2b2b2b' },
  },
];

export function interviewerById(id) {
  return INTERVIEWERS.find(i => i.id === id) || INTERVIEWERS[0];
}
