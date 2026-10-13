import type { Paper, Question, Feedback, Stage } from './types';
export const SAMPLE_PAGES = [
  'Community Library Study Spaces\nA synthetic thesis for defense rehearsal\nThis fictional example explores how students describe access to quiet study spaces at a community library. It is teaching material, not an actual research study. The research question is: how do undergraduate students describe the role of library study spaces in their study routines? No causal effect on grades is claimed.',
  'Research design and participants\nThe proposed design is a qualitative descriptive study using semi-structured interviews. Purposive sampling seeks twelve undergraduate students who used the library at least twice in the past month. Recruitment is voluntary. The sample is intended to explore experiences in depth rather than statistically represent all students. This synthetic document contains a proposed protocol and illustrative discussion, not collected participant data.',
  'Data collection and analysis\nInterviews would last approximately thirty minutes, with written informed consent before audio recording. Students may withdraw before anonymized coding. Names would be replaced by participant codes and recordings stored in restricted local storage. Reflexive thematic analysis would involve familiarization, coding, developing candidate themes, reviewing themes, and writing a contextual account. A reflexive journal would record researcher assumptions.',
  'Illustrative discussion\nPossible interview prompts ask about noise, seating, opening hours, and study routines. These topics are prompts, not results or participant quotations. No interviews have been conducted. No findings, validated themes, test scores, or effect sizes are reported. A final defense rehearsal should explain this limitation rather than invent results. Evidence about improved grades would require a different design and appropriate outcome measurements.',
  'Limitations and next steps\nA single library and voluntary participation may restrict the range of experiences described. Recall and social desirability may influence interview responses. Future work could include additional libraries and consider observational methods with appropriate consent. The protocol would need institutional ethics review before recruitment; no ethics approval has been granted or claimed. The proposed contribution is a contextual account of student experiences, not a generalizable causal claim.',
];
export function sourcesFromPages(pages: { number: number; text: string }[]) {
  return pages.flatMap((page) => {
    const chunks: string[] = [];
    let offset = 0;
    while (offset < page.text.length) {
      let end = Math.min(offset + 1200, page.text.length);
      if (end < page.text.length) {
        const boundary = page.text.lastIndexOf(' ', end);
        if (boundary > offset + 800) end = boundary;
      }
      chunks.push(page.text.slice(offset, end));
      offset = end;
    }
    return chunks
      .map((text, i) => ({ id: `p${page.number}-s${i + 1}`, page: page.number, text: text.trim() }))
      .filter((s) => s.text.length > 20);
  });
}
export function samplePaper(): Paper {
  const pages = SAMPLE_PAGES.map((text, i) => ({ number: i + 1, text }));
  return {
    id: 'sample-library',
    title: 'Community Library Study Spaces',
    filename: 'sample-thesis.pdf',
    createdAt: new Date().toISOString(),
    pageCount: 5,
    sample: true,
    pages,
    sources: sourcesFromPages(pages),
    warnings: [
      'Synthetic teaching paper. No participant data or findings. Physical PDF page numbers are used.',
    ],
  };
}
export const FOCI = [
  'Research design',
  'Sampling',
  'Ethics',
  'Evidence & claims',
  'Limitations',
  'Research contribution',
];
export function sampleQuestion(index: number, stage: Stage): Question {
  const questions = [
    {
      text: 'Why is a qualitative descriptive design appropriate for your research question?',
      focus: FOCI[0],
      citationIds: ['p1-s1', 'p2-s1'],
    },
    {
      text: 'How would you justify purposive sampling, and what can twelve interviews reasonably tell you?',
      focus: FOCI[1],
      citationIds: ['p2-s1'],
    },
    {
      text: 'What would you do if a participant withdrew after an interview?',
      focus: FOCI[2],
      citationIds: ['p3-s1'],
    },
    {
      text:
        stage === 'final'
          ? 'What findings can you defend, given that this paper reports no collected interview data?'
          : 'How will you keep possible interview topics separate from actual findings?',
      focus: FOCI[3],
      citationIds: ['p4-s1'],
    },
    {
      text: 'Which limitation most affects the claims you can make, and how would you address it?',
      focus: FOCI[4],
      citationIds: ['p5-s1'],
    },
    {
      text: 'How does your proposed contribution differ from a claim that libraries improve grades?',
      focus: FOCI[5],
      citationIds: ['p1-s1', 'p5-s1'],
    },
  ];
  return { ...questions[index % questions.length], kind: 'panel' };
}
export function sampleFeedback(q: Question): Feedback {
  const paper = samplePaper(),
    source = paper.sources.find((s) => q.citationIds.includes(s.id))!;
  return {
    sample: true,
    support: 'sample',
    summary: 'Scripted rehearsal cues — these do not evaluate the answer you typed.',
    strength: 'Make your opening sentence answer the panel’s question directly.',
    improve:
      'Connect the design choice to the research question, then acknowledge what it cannot establish.',
    nextStep:
      'Try a three-part response: your decision, the reason, and one boundary of the claim.',
    weakArea: q.focus,
    evidence: [
      { citationId: source.id, quote: source.text.slice(0, Math.min(source.text.length, 260)) },
    ],
    followup: {
      text: 'What evidence would make you reconsider that decision, and why?',
      focus: q.focus,
      citationIds: q.citationIds,
      kind: 'followup',
    },
  };
}
