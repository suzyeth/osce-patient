# Review sheet: case-res0001

Source: RES0001.txt (Fareez et al. 2022, CC0). Case is marked **unreviewed**: no clinician has seen it.

Patient: Jen Carter, 52. A 52-year-old female bank administrator who speaks clearly and provides detailed responses, volunteering relevant information such as recent surgery and lifestyle habits without prompting.

Brief: You are a doctor in a GP surgery. Jen Carter, 52, has come in about chest pain with associated shortness of breath. Take a focused history. You have 8 minutes.

## Check each fact against the words it came from

Tick when the fact says nothing the quote does not say. Cross anything added, sharpened or guessed.

| | Fact the patient may say | Their words in the transcript | Line |
|---|---|---|---|
| [ ] | I’ve had this pain in my chest for just over a week now and it’s caused me to have trouble breathing. | I so I've just had this pain in my chest for just over a week now and it's caused me to have trouble breathing. | 3 |
| [ ] | The chest pain is sharp and constant, but worsens when I take a deep breath. | Ahh it it is, but it's definitely worse that um, it's the breathing that's been bothering me a lot more. When I take a deep breath that the pain is a lot worse. | 15 |
| [ ] | Each episode of pain lasts about 15 to 20 minutes before easing off. | Um I would say, uh. Around 15-20 minutes. It's it goes away over overtime. | 19 |
| [ ] | I get short of breath when I exert myself, like walking a few blocks, but it improves when I rest. | Uh no if I if I take a break or sit down to rest then I can usually catch my breath. But if even if I'm doing a little bit of exertion like walking a few a few blocks or something like that I'm finding it, I'm I'm short of breath. | 23 |
| [ ] | My shortness of breath reaches up to 7 or 8 out of 10 during exertion. | I would say when I'm exerting myself, it could get up to like a 7 or 8. | 48 |
| [ ] | Before this, I used to run a few days a week, but now I can only walk about 100 meters before needing to rest. | I I would say maybe 100 meters. But before I was able to run uh like I was running a few days per week so. So this is not like me. | 52 |
| [ ] | I’ve had a dry cough for about a week, which started around the same time as the chest pain. | Yeah, it's um. I still have a cough. | 32 |
| [ ] | I had a hysterectomy a few weeks ago due to heavy bleeding from fibroids. | No, like I've been um previously healthy, but I I guess I did have a hysterectomy a few weeks ago. I know it was, I I didn't bring it up before 'cause it's just a day procedure, but I was definitely spending a lot more time um relaxing at home after that, a few weeks ago. | 141 |
| [ ] | I smoke about half a pack of cigarettes per day and have smoked since my teenage years. | Um I I smoke, I may be about half a pack of cigarettes per day. I've smoked ever since I was a teenager. | 190 |
| [ ] | I occasionally have a glass of wine on weekends but otherwise do not drink alcohol. | Uh may be a glass of wine on the weekends, but other than that no. | 204 |
| [ ] | My mother had a heart attack at age 56. | Yeah, it's just my mom had a heart attack when she was 56. | 174 |
| [ ] | I sometimes feel like my heart is racing, especially when I move around more. | Uh, actually I did feel like that a little bit. Especially when I was moving a little bit more, I felt like my heart was racing. | 100 |
| [ ] | My left leg feels a little sore, though I’m not sure if there’s swelling. | Um yeah my left, my left leg's actually a little bit sore. | 104 |
| [ ] | I am concerned this might be something serious like a blood clot, given my recent surgery and symptoms. | I I had a cough about a week ago so I thought it might be a chest infection, but I'm not feverish, so I'm not sure. | 27 |

## What the tool threw away

Nothing: every proposed fact was found in the transcript.

## Worth a second look

- "pain" is already in what the candidate is told before asking, so it cannot be guarded
- f_associated_symptoms_13 mentions a painful or swollen leg, so it became the red-flag item "Asks about a painful or swollen leg"; check that this case really needs it
- fact f_onset_duration_3 has no guarded terms, so the output guard cannot protect it
- fact f_associated_symptoms_12 has no guarded terms, so the output guard cannot protect it
- fact f_ice_concerns_14 has no guarded terms, so the output guard cannot protect it

## Still to do by hand

- [ ] Add the concern (ideas, concerns, expectations) if the transcript has none, and mark it as authored.
- [ ] Check the red flags against an NHS page and add the link to the case notes.
- [ ] Read the opening line aloud: does it sound like a person?
