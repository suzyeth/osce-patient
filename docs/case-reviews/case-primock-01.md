# Review sheet: case-primock-01

Source: day1_consultation01 (PriMock57 (Babylon Health) 2022, CC BY 4.0). Case is marked **unreviewed**: no clinician has seen it.

Patient: David Hughes, 35. An employed accountant who lives with his wife and two children, speaks clearly and provides detailed responses when questioned, remains cooperative throughout the consultation.

Brief: You are a doctor in a GP surgery. David Hughes, 35, has come in about diarrhoea for three days. Take a focused history. You have 8 minutes.

## Check each fact against the words it came from

Tick when the fact says nothing the quote does not say. Cross anything added, sharpened or guessed.

| | Fact the patient may say | Their words in the transcript | Line |
|---|---|---|---|
| [ ] | I've had diarrhoea for the last three days. | I've just had some diarrhea for the last three days | 2 |
| [ ] | It's been affecting my day-to-day activities and I need to stay close to the toilet. | it's been affecting me I need to stay close to the toilet. And, um, yeah, it's been affecting my day-to-day activities. | 2 |
| [ ] | My stools are loose and watery, and I go to the toilet about six or seven times a day. | Yeah, so it's like loose and watery stool, going to the toilet quite often | 4 |
| [ ] | I have cramp-like pain in my lower left abdomen that comes and goes. | it feels, um, like a cramp, like a muscular cramp | 14 |
| [ ] | I feel weak and shaky, especially when the symptoms started. | yeah i feel a bit uh weak and shaky. | 14 |
| [ ] | I had a fever around three or four days ago when the symptoms started. | I did notice um a temperature when the symptoms started, so, um, yeah around about three or four days ago. | 20 |
| [ ] | I vomited at the start of the symptoms but have now stopped vomiting. | I vomited at the start of the symptoms but now um I've stopped vomiting. | 24 |
| [ ] | I've had a loss of appetite but I can still hold down fluids. | I had a loss of appetite, um, so I haven't been eating as much, but I've been able to hold down fluids. | 28 |
| [ ] | I've been eating soups, smoothies and other liquid foods. | just soups, and, uh, yeah, light foods. Like smoothies and, yeah, liquid foods mainly. | 30 |
| [ ] | I had takeaway from a Chinese restaurant about four days ago. | Yeah, so I had takeaway about four days ago | 32 |
| [ ] | No one else in my household has had the same symptoms as me. | no one else in the family, so ... a wife and two kids and one, um, child was vomiting, but they haven't got diarrhea. There's no one with the same symptoms. | 36 |
| [ ] | I have asthma but it is well-controlled with an inhaler. | other than um athsma, um I use an inhaler, everything uh else is fine. | 38 |
| [ ] | I am not taking any other medications besides my inhaler. | Uh, no, no other medications. | 44 |
| [ ] | I do not smoke or drink alcohol. | Uh, no, I don't smoke. | 54 |
| [ ] | I work as an accountant and have been going to work despite the symptoms, which has been difficult. | Uh, yes, yeah. I I work, er. Um, I'm an accountant. | 48 |

## What the tool threw away

| Proposed fact | Why it was dropped |
|---|---|
| I am worried that my symptoms might be caused by something serious since they are not improving quickly enough. | the doctor said this, not the patient (line 75) |

## Worth a second look

- "three days" is already in what the candidate is told before asking, so it cannot be guarded
- "day-to-day" is already in what the candidate is told before asking, so it cannot be guarded
- "accountant" is already in what the candidate is told before asking, so it cannot be guarded
- the persona or opening line says "it's been affecting", which belongs to the locked fact f_social_life_2
- f_social_smoking_alcoh_14 is too short to stand on its own ("I do not smoke or drink alcohol."); rewrite it as something the patient could say unprompted
- fact f_social_life_2 has no guarded terms, so the output guard cannot protect it
- fact f_social_life_15 has no guarded terms, so the output guard cannot protect it
- text of f_social_life_2 shares "it's been affecting my" with the opening line, so the patient could say it while f_social_life_2 is locked
- text of f_associated_symptoms_5 shares "when the symptoms started" with fact f_associated_symptoms_6, so the patient could say it while f_associated_symptoms_5 is locked
- text of f_associated_symptoms_6 shares "when the symptoms started" with fact f_associated_symptoms_5, so the patient could say it while f_associated_symptoms_6 is locked

## Still to do by hand

- [ ] Add the concern (ideas, concerns, expectations) if the transcript has none, and mark it as authored.
- [ ] Check the red flags against an NHS page and add the link to the case notes.
- [ ] Read the opening line aloud: does it sound like a person?
