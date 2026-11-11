// Behavioural / HR questions shared by all roles (offline).
// Scored on structure (STAR: situation, task, action, result) rather than facts.
import { kp } from './kp.js';

const ALL = ['entry', 'mid', 'senior', 'lead'];

export const COMMON_QUESTIONS = [
  {
    id: 'hr-001', topic: 'Introduction', levels: ALL, type: 'intro',
    q: 'To get started, could you briefly introduce yourself and walk me through your experience?',
    keyPoints: [
      kp('Current role and background', 'currently', 'my role', 'working as', 'experience', 'years', 'graduat*', 'background'),
      kp('Key skills or technologies', 'skill*', 'technolog*', 'stack', 'java', 'spring', 'kubernetes', 'docker', 'aws'),
      kp('A concrete achievement or project', 'project*', 'built', 'achiev*', 'delivered', 'led', 'improved'),
      kp('Why this role', 'interested', 'looking for', 'excited', 'this role', 'next step', 'motivat*'),
    ],
    ideal: 'I am currently working as a backend engineer with about four years of experience, mostly with Java, Spring Boot and AWS. In my current role I own the order management services. A project I am proud of: I built an event-driven integration with Kafka that improved order processing time by 40 percent. I enjoy solving performance and reliability problems, and I am looking for a role where I can take more ownership of system design, which is why this role interests me.',
    followUp: 'What is one technical achievement from that experience you are most proud of?',
  },
  {
    id: 'hr-002', topic: 'Problem Solving', levels: ALL, type: 'behavioral',
    q: 'Tell me about the most challenging technical problem you have solved. What was your approach?',
    keyPoints: [
      kp('Situation / context', 'situation', 'context', 'project', 'production', 'when we', 'we had'),
      kp('Task / your responsibility', 'task', 'responsib*', 'my goal', 'i was asked', 'i owned'),
      kp('Actions you personally took', 'i investigated', 'i analysed', 'i analyzed', 'i implemented', 'i added', 'i found', 'i decided', 'action*'),
      kp('Measurable result', 'result*', 'outcome', 'reduced', 'improved', 'percent', 'impact'),
    ],
    ideal: 'The situation was that our payment service in production started timing out during peak hours. As the on-call engineer, my task was to find the cause and restore stability. I investigated the traces and found connection pool exhaustion; I analysed thread dumps and found a slow query without an index plus a missing timeout on a downstream call. I implemented the index, added timeouts and a circuit breaker, and added an alert on pool usage. As a result, p99 latency reduced from 4 seconds to 300 milliseconds and we had no further incidents, which improved checkout success by 2 percent.',
    followUp: 'Looking back, what would you do differently?',
  },
  {
    id: 'hr-003', topic: 'Teamwork', levels: ['mid', 'senior', 'lead'], type: 'behavioral',
    q: 'Describe a time you disagreed with a teammate or your manager on a technical decision. How did you handle it?',
    keyPoints: [
      kp('The disagreement', 'disagree*', 'conflict', 'different opinion', 'did not agree'),
      kp('Listening and understanding their view', 'listen*', 'understand*', 'perspective', 'their point'),
      kp('Using data and discussion to resolve', 'data', 'benchmark', 'proof of concept', 'discuss*', 'compromise', 'trade off*'),
      kp('Outcome and relationship', 'result*', 'agreed', 'outcome', 'relationship', 'learn*'),
    ],
    ideal: 'We had a disagreement about whether to introduce Kafka or keep using REST calls between two services. Instead of arguing, I first tried to listen and understand my colleague perspective: he was worried about operational complexity. We agreed to discuss it with data, so I built a small proof of concept and a benchmark, and we compared the trade offs in a short design document. We reached a compromise: we used a managed queue for that flow and postponed Kafka. The result was a solution both of us supported, and our working relationship actually improved. I learned that framing disagreements around shared goals and data works much better than opinions.',
    followUp: 'What would you have done if the decision went against you?',
  },
  {
    id: 'hr-004', topic: 'Prioritisation', levels: ALL, type: 'behavioral',
    q: 'Tell me about a time you had to deliver under a tight deadline. How did you prioritise?',
    keyPoints: [
      kp('Prioritising scope', 'prioriti*', 'must have', 'scope', 'mvp', 'critical'),
      kp('Communicating with stakeholders', 'communicat*', 'stakeholder*', 'manager', 'product owner', 'informed'),
      kp('Planning and execution', 'plan*', 'broke down', 'break down', 'split', 'focus*'),
      kp('Result', 'delivered', 'on time', 'result*', 'launched', 'met the deadline'),
    ],
    ideal: 'We had two weeks to deliver a regulatory reporting feature that was originally planned for six. I broke down the work into tasks and worked with the product owner to prioritise the must have requirements for the regulator versus nice-to-have items, which cut the scope almost in half. I communicated the plan and the risks to my manager and stakeholders early and kept them informed with short daily updates. The team focused on the critical path, and I paired with a junior developer on the riskiest part. We delivered on time, passed the audit, and shipped the remaining features in the next sprint.',
    followUp: 'How do you push back when a deadline is genuinely unrealistic?',
  },
  {
    id: 'hr-005', topic: 'Learning from Failure', levels: ALL, type: 'behavioral',
    q: 'Tell me about a mistake you made at work and what you learned from it.',
    keyPoints: [
      kp('Owning the mistake', 'mistake', 'my fault', 'responsibility', 'i owned', 'i caused', 'i made'),
      kp('Fixing it and limiting impact', 'fix*', 'mitigat*', 'impact', 'rolled back', 'recover*'),
      kp('What you learned', 'learn*', 'lesson'),
      kp('Preventing recurrence', 'prevent*', 'process', 'checklist', 'automat*', 'test*'),
    ],
    ideal: 'Early in my career I made a mistake: I ran a database migration in production without testing it on realistic data volume, and it locked a large table for several minutes. I took responsibility immediately, told my lead, and we rolled back and fixed the migration to run in batches, which limited the impact to a short slowdown. The lesson I learned was that changes need to be tested under production-like conditions. To prevent it from happening again, I added a migration checklist and an automated test in the pipeline that runs migrations against a copy of production-sized data.',
    followUp: 'How did your team react, and what did you change in your process afterwards?',
  },
  {
    id: 'hr-006', topic: 'Motivation', levels: ALL, type: 'behavioral',
    q: 'Why are you interested in this role, and where do you see yourself growing in the next few years?',
    keyPoints: [
      kp('Interest in the role, team or product', 'this role', 'company', 'team', 'product', 'domain'),
      kp('How your skills match', 'skill*', 'experience', 'match', 'fit', 'background'),
      kp('Growth and contribution', 'grow*', 'learn*', 'contribut*', 'impact', 'ownership'),
    ],
    ideal: 'I am interested in this role because the team builds high-scale backend systems in a domain I care about, and the product is used by millions of people. My experience with distributed systems, cloud infrastructure and production support is a strong match for what the team needs, so I can contribute from early on. Over the next few years I want to grow into a senior or lead role, take ownership of system design decisions, and mentor other engineers, while continuing to learn and having a measurable impact on the product.',
    followUp: 'What would make you leave a job?',
  },
  {
    id: 'hr-007', topic: 'Leadership', levels: ['senior', 'lead'], type: 'behavioral',
    q: 'How have you mentored or grown other engineers on your team? Give a specific example.',
    keyPoints: [
      kp('Mentoring or coaching', 'mentor*', 'coach*', 'pair*', 'guid*'),
      kp('Delegation and ownership', 'delegat*', 'ownership', 'stretch', 'responsib*'),
      kp('Regular feedback', 'feedback', 'one on one', '1 1', 'regular'),
      kp('Outcome for the person or team', 'promoted', 'result*', 'improved', 'independent*', 'confiden*'),
    ],
    ideal: 'I mentored a junior engineer who joined without microservices experience. I started by pairing with her on small tickets and code reviews, then gradually delegated ownership of a complete feature as a stretch goal, while staying available for guidance. We had regular one on one sessions where I gave specific, actionable feedback and asked what she wanted to learn. Within six months she was working independently, leading design discussions for her service, and she was promoted the following year. Her confidence improved and the team gained another reliable reviewer.',
    followUp: 'How do you handle a team member who is consistently underperforming?',
  },
  {
    id: 'hr-008', topic: 'Leadership', levels: ['lead'], type: 'behavioral',
    q: 'Describe a significant technical decision you drove. How did you evaluate the options and get buy-in?',
    keyPoints: [
      kp('Options and trade-offs considered', 'option*', 'trade off*', 'alternative*', 'pros and cons'),
      kp('Evidence: data, POC, benchmarks', 'data', 'proof of concept', 'poc', 'benchmark*', 'prototype'),
      kp('Alignment and documentation (RFC/ADR)', 'stakeholder*', 'buy in', 'align*', 'rfc', 'adr', 'design doc*'),
      kp('Outcome', 'result*', 'outcome', 'reduced', 'improved', 'saved'),
    ],
    ideal: 'I drove the decision to move our services from self-managed VMs to Kubernetes on EKS. I evaluated three options, staying on VMs, ECS, and EKS, with their trade offs in cost, team skills, portability and operational load, and we ran a two-week proof of concept with benchmarks on one service. I wrote an RFC and an ADR, reviewed it with the architects, security and the teams that would use it, and incorporated their concerns, which got real buy in and alignment instead of a top-down decision. The result: deployment time reduced from hours to minutes, and infrastructure costs dropped by about 25 percent within a year.',
    followUp: 'Tell me about a decision of yours that turned out to be wrong. How did you course-correct?',
  },
  {
    id: 'hr-009', topic: 'Closing', levels: ALL, type: 'behavioral',
    q: 'How do you keep your technical skills up to date?',
    keyPoints: [
      kp('Learning sources', 'blog*', 'book*', 'course*', 'documentation', 'conference*', 'podcast*', 'newsletter*'),
      kp('Hands-on practice', 'side project*', 'hands on', 'practice', 'build*', 'experiment*', 'open source'),
      kp('Sharing with others', 'share', 'sharing', 'talk*', 'team', 'knowledge'),
    ],
    ideal: 'I follow a few engineering blogs, release notes and documentation for the tools we use, and I take a course or read a book each quarter on a topic I want to go deeper in, plus a couple of podcasts and newsletters. But I learn best hands on, so I build small side projects and experiment with new features, and I occasionally contribute to open source. I also make a habit of sharing what I learn with the team through short knowledge-sharing talks, which forces me to understand it properly.',
    followUp: 'What is something new you learned in the last month?',
  },
];
