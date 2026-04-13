---
name: social-strategist
kind: service
---

requires:
- article: the published article content

ensures:
- twitter-content: main announcement tweet, 5-tweet thread, and 3 standalone insight tweets
- linkedin-post: professional post (150-300 words) ending with engagement question
- hn-submission: factual title under 80 chars with genuine, non-promotional comment

strategies:
- match the culture of each platform
- when article is technical: lead with the insight, not the announcement
