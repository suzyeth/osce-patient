# Review sheet: case-gas0001

Source: GAS0001.txt (Fareez et al. 2022, CC0). Case is marked **unreviewed**: no clinician has seen it.

Patient: Emma Clarke, 25. A young woman who works part-time in retail and lives with a roommate. She speaks hesitantly, often qualifying her answers, and provides details only when prompted. She is polite but not overly forthcoming, requiring gentle probing to elaborate on symptoms.

Brief: You are a doctor in a GP surgery. Emma Clarke, 25, has come in about Persistent nausea and vomiting. Take a focused history. You have 8 minutes.

## Check each fact against the words it came from

Tick when the fact says nothing the quote does not say. Cross anything added, sharpened or guessed.

| | Fact the patient may say | Their words in the transcript | Line |
|---|---|---|---|
| [ ] | I've just been feeling like very nauseated for, it feels like all the time right now. | I've just been feeling like very nauseated for, it feels like all the time right now. | 3 |
| [ ] | It's been over a week. Maybe not quite two weeks, but like around then. Yeah, maybe like 9 days. | It's been over a week. Maybe not quite two weeks, but like around then. Yeah, maybe like 9 days. | 7 |
| [ ] | Oh, I think it's like worse when I am smelling something really bad, and it's worse in the morning. But I feel like it's always kind of there. | Oh, I think it's like worse when I am smelling something really bad, and it's worse in the morning. But I feel like it's always kind of there. | 11 |
| [ ] | Uh, yeah, like um, yeah, like a lot of days I'll throw up like once or twice. | Uh, yeah, like um, yeah, like a lot of days I'll throw up like once or twice. | 15 |
| [ ] | Oh no, just, well, like I feel like I've I've had to pee a lot more. Um, but I don't, I don't think that's like related. I think maybe I have just been drinking a lot of water, so yeah. | Oh no, just, well, like I feel like I've I've had to pee a lot more. Um, but I don't, I don't think that's like related. I think maybe I have just been drinking a lot of water, so yeah. | 23 |
| [ ] | Oh, like, I feel like every couple hours right now. | Oh, like, I feel like every couple hours right now. | 27 |
| [ ] | Probably every probably every like 2, maybe, maybe every hour I get certain times in a day. | Probably every probably every like 2, maybe, maybe every hour I get certain times in a day. | 31 |
| [ ] | Oh, like it doesn't wake me up but it's like I wake up because I hear something. Then I'll be like, oh I think I should probably go to the bathroom. | Oh, like it doesn't wake me up but it's like I wake up because I hear something. Then I'll be like, oh I think I should probably go to the bathroom. | 35 |
| [ ] | Ah no, I don't think so, well my stomach has been like it feels like a little crampy. I thought that maybe it could be my period but like I'm not on my period. | Ah no, I don't think so, well my stomach has been like it feels like a little crampy. I thought that maybe it could be my period but like I'm not on my period. | 55 |
| [ ] | No, I mean, I've been taking like like I've been chewing like those ginger things that are supposed to help with nausea, but they weren't really helpful. | No, I mean, I've been taking like like I've been chewing like those ginger things that are supposed to help with nausea, but they weren't really helpful. | 108 |
| [ ] | So just like nickel, like in jewelry, if I wear not real jewellery, it'll give me a rash, but it's not food or like or medications or anything. | So just like nickel, like in jewelry, if I wear not real jewellery, it'll give me a rash, but it's not food or like or medications or anything. | 112 |
| [ ] | Um, like I I just I live with one roommate. | Um, like I I just I live with one roommate. | 116 |
| [ ] | Uh, no, very rarely because I always get a headache. | Uh, no, very rarely because I always get a headache. | 124 |
| [ ] | Oh gosh, like like a month ago probably. | Oh gosh, like like a month ago probably. | 128 |
| [ ] | No, no. | No, no. | 132 |
| [ ] | Yeah just like with my boyfriend. | Yeah just like with my boyfriend. | 136 |
| [ ] | Yeah, we we just use condoms. I used to be on birth control but it always made me feel like like kind of sick so I don't use that anymore. | Yeah, we we just use condoms. I used to be on birth control but it always made me feel like like kind of sick so I don't use that anymore. | 140 |
| [ ] | Uh, like I don't, I don't think so. I guess my dad my dad has like high blood pressure, yeah, I don't think there's anything else. | Uh, like I don't, I don't think so. I guess my dad my dad has like high blood pressure, yeah, I don't think there's anything else. | 145 |

## What the tool threw away

| Proposed fact | Why it was dropped |
|---|---|
| Oh well, let me think. Um, like six weeks ago. I guess that would be, I don't know. I don't really like keep track. | no rubric item called "history" |
| I think they're I think they're usually pretty regular, but I don't I don't like I don't calculate it like to the day. | no rubric item called "history" |
| Oh, come to think of it, I don't, I don't think so. | no rubric item called "history" |

## Worth a second look

- fact f_character_severity_3 has no guarded terms, so the output guard cannot protect it
- fact f_associated_symptoms_4 has no guarded terms, so the output guard cannot protect it
- fact f_associated_symptoms_5 has no guarded terms, so the output guard cannot protect it
- fact f_associated_symptoms_6 has no guarded terms, so the output guard cannot protect it
- fact f_associated_symptoms_7 has no guarded terms, so the output guard cannot protect it
- fact f_associated_symptoms_8 has no guarded terms, so the output guard cannot protect it
- fact f_associated_symptoms_9 has no guarded terms, so the output guard cannot protect it
- fact f_social_life_15 has no guarded terms, so the output guard cannot protect it
- fact f_social_smoking_alcoh_16 has no guarded terms, so the output guard cannot protect it
- fact f_social_smoking_alcoh_17 has no guarded terms, so the output guard cannot protect it
- fact f_social_smoking_alcoh_18 has no guarded terms, so the output guard cannot protect it
- fact f_social_life_19 has no guarded terms, so the output guard cannot protect it
- text of f_associated_symptoms_5 shares "like i feel like" with fact f_associated_symptoms_6, so the patient could say it while f_associated_symptoms_5 is locked
- text of f_associated_symptoms_5 shares "i don't i don't" with fact f_family_history_21, so the patient could say it while f_associated_symptoms_5 is locked
- text of f_associated_symptoms_6 shares "like i feel like" with fact f_associated_symptoms_5, so the patient could say it while f_associated_symptoms_6 is locked
- text of f_associated_symptoms_9 shares "i don't think so" with fact f_family_history_21, so the patient could say it while f_associated_symptoms_9 is locked
- text of f_family_history_21 shares "i don't i don't" with fact f_associated_symptoms_5, so the patient could say it while f_family_history_21 is locked
- text of f_family_history_21 shares "i don't think so" with fact f_associated_symptoms_9, so the patient could say it while f_family_history_21 is locked

## Still to do by hand

- [ ] Add the concern (ideas, concerns, expectations) if the transcript has none, and mark it as authored.
- [ ] Check the red flags against an NHS page and add the link to the case notes.
- [ ] Read the opening line aloud: does it sound like a person?
