---
name: content-pipeline
kind: program
services: [researcher, writer, editor, social-strategist]
---

requires:
- topic: the topic to create content about
- audience: target audience (e.g., "developers", "executives", "general")

ensures:
- article: a polished, publication-ready blog post of 1500-2000 words
- social: platform-specific social media content for Twitter/X, LinkedIn, and Hacker News

strategies:
- when article needs revision: focus on editorial feedback, max 4 revision rounds
- when research is thin: broaden search to adjacent topics and use case studies
