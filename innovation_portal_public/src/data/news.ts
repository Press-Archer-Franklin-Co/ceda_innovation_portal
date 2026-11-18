export interface NewsItem {
  id: string
  title: string
  excerpt: string
  date: string
  category: 'Announcement' | 'Challenge Update' | 'Winners' | 'Partnership' | 'Success Story'
  readTime: string
  image: string
  cover_is_video?: boolean
  featured?: boolean
  highlight_priority?: number | null
  tags?: string[]
}

export const newsItems: NewsItem[] = [
  {
    id: '1',
    title: 'Welcome to the CEDA Innovation Portal',
    excerpt:
      'A single place for citizens and entrepreneurs to share ideas, enter innovation programmes, and track their progress from submission to support.',
    date: '2026-11-18',
    category: 'Announcement',
    readTime: '3 min read',
    image: 'launch',
    featured: true,
    tags: ['Innovation', 'Platform'],
  },
  {
    id: '2',
    title: 'How to Prepare a Strong Idea Submission',
    excerpt:
      'Practical tips on defining the problem, explaining your solution, and showing impact and feasibility before you submit.',
    date: '2026-11-18',
    category: 'Challenge Update',
    readTime: '4 min read',
    image: 'hackathon',
    tags: ['Guidance', 'Submissions'],
  },
  {
    id: '3',
    title: 'What Happens After You Submit',
    excerpt:
      'A walk-through of screening, evaluation, and feedback — and how you can follow each step from your dashboard.',
    date: '2026-11-18',
    category: 'Announcement',
    readTime: '3 min read',
    image: 'spotlight',
    tags: ['Process', 'Tracking'],
  },
]
