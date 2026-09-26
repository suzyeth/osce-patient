# Review sheet: case-msk0001

Source: MSK0001.txt (Fareez et al. 2022, CC0). Case is marked **unreviewed**: no clinician has seen it.

Patient: David Thompson, 65. Retired school teacher living alone, speaks calmly and provides clear answers without volunteering extra information.

Brief: You are a doctor in a GP surgery. David Thompson, 65, has come in about Low back pain. Take a focused history. You have 8 minutes.

## Check each fact against the words it came from

Tick when the fact says nothing the quote does not say. Cross anything added, sharpened or guessed.

| | Fact the patient may say | Their words in the transcript | Line |
|---|---|---|---|
| [ ] | The pain started yesterday while I was unloading groceries from my pickup truck. | It started yesterday, I was unloading groceries from my pickup truck when it suddenly started. | 11 |
| [ ] | The pain is in my lower back and feels stabbing. | It feels like it's stabbing just right in my lower back. | 19 |
| [ ] | When I sit completely still, the pain is 2 out of 10. | If I'm sitting, uh completely still like like I am right now, it's a 2 out of 10. | 23 |
| [ ] | The pain gets worse when I move, bend my back, or even cough. | Uh anytime I I move or bend my back or uh even cough it it worsens the pain significantly. | 27 |
| [ ] | The pain has not changed since it started yesterday. | No, it's been this same awful pain this whole time. | 31 |
| [ ] | I also feel the pain going into my right leg as an aching sensation. | I also feel the pain uh into my right leg. | 39 |
| [ ] | I have had back pain over the years, but nothing like this before. | I've had back pain uh over the years, but nothing like this before. | 35 |
| [ ] | I have type 2 diabetes and take insulin for it. | Uh type 2 diabetes. | 111 |
| [ ] | I take insulin for my diabetes. | Uh I, um insulin for diabetes. | 115 |
| [ ] | I have been taking Tylenol for the back pain, which only takes the edge off a little. | Uh just been taking Tylenol for the the back pain. | 119 |
| [ ] | I had hemorrhoids removed three years ago as day surgery. | Uh I had hemorrhoids removed three years ago. | 131 |
| [ ] | My father had prostate cancer. | Uh my father had prostate cancer. | 139 |
| [ ] | I am a retired school teacher and live alone in a house not far from here. | I live alone um in a in a house uh not too far from here, actually. | 147 |
| [ ] | I occasionally drink a glass of red wine on the weekend but not too often. | Um occasionally uh maybe I'll have a glass of red wine on the weekend or something like that, but uh not too often. | 151 |
| [ ] | I smoke a pack of cigarettes per day and have done so for about 40 years. | Uh, I've smoked um yeah, I smoke a pack of cigarettes uh per day. | 155 |
| [ ] | I have been sexually active with more than one partner in the past year and always use condoms. | Uh yes, I have, um um two women over the past year. | 183 |

## What the tool threw away

Nothing: every proposed fact was found in the transcript.

## Worth a second look

- "groceries" is already in what the candidate is told before asking, so it cannot be guarded
- "pickup truck" is already in what the candidate is told before asking, so it cannot be guarded
- "move" appears in another fact too, so guarding it would hide that one as well
- "back pain" is already in what the candidate is told before asking, so it cannot be guarded
- "insulin" appears in another fact too, so guarding it would hide that one as well
- "retired school teacher" is already in what the candidate is told before asking, so it cannot be guarded
- the persona or opening line says "retired school teacher", which belongs to the locked fact f_social_life_13
- f_medications_allergie_9 is too short to stand on its own ("I take insulin for my diabetes."); rewrite it as something the patient could say unprompted
- f_family_history_12 is too short to stand on its own ("My father had prostate cancer."); rewrite it as something the patient could say unprompted
- fact f_onset_duration_5 has no guarded terms, so the output guard cannot protect it
- fact f_medications_allergie_9 has no guarded terms, so the output guard cannot protect it

## Still to do by hand

- [ ] Add the concern (ideas, concerns, expectations) if the transcript has none, and mark it as authored.
- [ ] Check the red flags against an NHS page and add the link to the case notes.
- [ ] Read the opening line aloud: does it sound like a person?
