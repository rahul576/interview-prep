// Aggregated offline question bank.
import { JAVA_QUESTIONS } from './questions-java.js';
import { JAVA_MORE } from './questions-java-more.js';
import { DEVOPS_QUESTIONS } from './questions-devops.js';
import { DEVOPS_MORE } from './questions-devops-more.js';
import { AZURE } from './questions-azure.js';
import { KAFKA, ELASTIC } from './questions-kafka-es.js';
import { DSA } from './questions-dsa.js';
import { COMMON_QUESTIONS } from './questions-common.js';
import { MANAGERIAL } from './questions-managerial.js';
import { JAVA_EXTRA, DEVOPS_EXTRA } from './questions-extra.js';
import { JAVA_CORE2 } from './questions-java-core2.js';
import { JAVA_SPRING2 } from './questions-java-spring2.js';
import { JAVA_ARCH2 } from './questions-java-arch2.js';
import { JB_CORE } from './questions-jb300-core.js';
import { JB_RUNTIME } from './questions-jb300-runtime.js';
import { JB_SPRING } from './questions-jb300-spring.js';
import { JB_ARCH } from './questions-jb300-arch.js';

export const BANK_VERSION = '1.4.0';

// Questions that already declare a cat (e.g. 'shared') keep it.
const withCat = (list, cat) => list.map(q => Object.freeze({ cat, ...q }));

export const QUESTIONS = Object.freeze([
  ...withCat(JAVA_QUESTIONS, 'java-backend'),
  ...withCat(JAVA_MORE, 'java-backend'),
  ...withCat(JAVA_EXTRA, 'java-backend'),
  ...withCat(JAVA_CORE2, 'java-backend'),
  ...withCat(JAVA_SPRING2, 'java-backend'),
  ...withCat(JAVA_ARCH2, 'java-backend'),
  ...withCat(JB_CORE, 'java-backend'),
  ...withCat(JB_RUNTIME, 'java-backend'),
  ...withCat(JB_SPRING, 'java-backend'),
  ...withCat(JB_ARCH, 'java-backend'),
  ...withCat(DEVOPS_QUESTIONS, 'devops'),
  ...withCat(DEVOPS_MORE, 'devops'),
  ...withCat(AZURE, 'devops'),
  ...withCat(DEVOPS_EXTRA, 'devops'),
  ...withCat(KAFKA, 'shared'),
  ...withCat(ELASTIC, 'shared'),
  ...withCat(DSA, 'shared'),
  ...withCat(COMMON_QUESTIONS, 'common'),
  ...withCat(MANAGERIAL, 'common'),
]);

export const TECH_TYPES = ['concept', 'scenario', 'design'];
export const HR_TYPES = ['behavioral', 'managerial'];

/** Is question q part of the interview pool for role (category id)? */
export function belongsTo(q, role) {
  if (q.cat === role) return true;
  if (q.cat === 'shared' || q.cat === 'common') return !q.roles || q.roles.includes(role);
  return false;
}

// Fine-grained topics are grouped into the categories shown in the setup screen.
const GROUPS = {
  'Exceptions': 'Core Java & OOP',
  'Spring Framework': 'Spring & Spring Boot', 'Spring Boot': 'Spring & Spring Boot',
  'Databases & SQL': 'Databases & Caching', 'Caching': 'Databases & Caching',
  'System Design': 'System Design & Architecture', 'Architecture': 'System Design & Architecture',
  'Testing': 'Testing & Observability', 'Observability': 'Testing & Observability',
  'Troubleshooting': 'Troubleshooting',
  'Low-Level Design': 'System Design & Architecture',
  'DSA: Arrays & Strings': 'DSA', 'DSA: Lists, Stacks & Queues': 'DSA', 'DSA: Trees & Graphs': 'DSA', 'DSA: Algorithms & DP': 'DSA',
  'Azure': 'Azure', 'Azure DevOps & Pipelines': 'Azure', 'Azure Kubernetes (AKS)': 'Azure',
  'DevOps & CI/CD': 'CI/CD & Git', 'CI/CD Tools': 'CI/CD & Git', 'Git': 'CI/CD & Git',
  'Infrastructure as Code': 'IaC & Config Management', 'Configuration Management': 'IaC & Config Management',
  'Observability & SRE': 'Observability & SRE', 'Reliability & DR': 'Observability & SRE',
  'Service Mesh': 'Kubernetes',
  'DevSecOps': 'DevSecOps & Code Quality', 'Artifacts & Code Quality': 'DevSecOps & Code Quality',
  'Linux': 'Linux & Scripting', 'Scripting': 'Linux & Scripting',
};

/** Category (chip) a topic belongs to. */
export function topicGroup(topic) {
  return GROUPS[topic] || topic;
}

/** Technical categories available for a role, with question counts (largest first). */
export function topicsFor(role) {
  const map = new Map();
  for (const q of QUESTIONS) {
    if (!TECH_TYPES.includes(q.type) || !belongsTo(q, role)) continue;
    const g = topicGroup(q.topic);
    map.set(g, (map.get(g) || 0) + 1);
  }
  return [...map.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export function questionById(id) {
  return QUESTIONS.find(q => q.id === id);
}
