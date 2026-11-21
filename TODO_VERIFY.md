# Что сверить с вики

Неподтверждённые механики и данные. В код они попадают только с пометкой (`auto: true` в эффекте, `verified: false` в overrides) и сюда.

## Корзины модов и мистификаторов

- [ ] **«Direct Damage» у новых Galvanized** (Shot, Aptitude, Diffusion и др.): это то же, что базовый урон, или отдельный множитель? Пока своя корзина `direct_damage`.
  https://wiki.warframe.com/w/Galvanized_Shot · https://wiki.warframe.com/w/Galvanized_Aptitude
- [ ] **Условные эффекты, разобранные автоматически** (76 шт., список в `tools/unparsed.md`): проверить триггер, длительность и стаки, а также к каким строкам относится условие. Пример: у Primary Merciless «+30% Reload Speed» записана без условия.
  https://wiki.warframe.com/w/Primary_Merciless
- [ ] **Arcane Rage, Arcane Fury и подобные «+X% Damage to … Weapons»**: попадают ли в корзину базового урона (как Serration)?
  https://wiki.warframe.com/w/Arcane_Rage
- [ ] **Hunter Munitions, Internal Bleeding**: механика принудительного Разреза (шанс на крит / на статус Удара, ×2 при скорострельности < 2,5). В `data/overrides/mods.json` значения из текста WFCD.
  https://wiki.warframe.com/w/Hunter_Munitions · https://wiki.warframe.com/w/Internal_Bleeding

## Враги

- [ ] **Древний Разрушитель**: защита от урона способностей. Вики — 90%, замер в Симулякре 20.11.2026 (Ораксия + Лекс Прайм / Пророк) — 50%. В данных стоит 0,5.
  https://wiki.warframe.com/w/Ancient_Disruptor
- [ ] **Тяжёлая Пулемётчица 115**: снижение урона по формуле брони 90% (броня 2700). Замер Летумом без ульты Ораксии (25 из 192) дал 87%. Множитель ×1,3 в замерах Натарука, Летума и Супра Вандала — вероятно, бафф «при убийстве». В калькуляторе Ораксии владелец считает с DR = 0,87.
- [ ] **Масштабирование здоровья Anarchs**: в табе вики «Anarchs, Corrupted», а в тексте — «Murmur, Sentient, Anarchs, and Unaffiliated». Сейчас взят первый вариант.
  https://wiki.warframe.com/w/Enemy_Level_Scaling
- [ ] **Стальной Путь**: множители уровня и статов врагов не внесены.
  https://wiki.warframe.com/w/The_Steel_Path
- [ ] **Eximus и Overguard**: формулы роста не внесены.
  https://wiki.warframe.com/w/Enemy_Level_Scaling#Overguard
- [ ] **Русские названия врагов**: в WFCD i18n их нет, враги пока на английском.

## Фреймы

- [ ] **Статы на 30-м ранге**: в `Module:Warframes/data` у части фреймов есть `EnergyRank30`. Здоровье и щиты на 30-м ранге: по странице Silken Stride у Ораксии 675 при 575 в данных. Нужна формула.
  https://wiki.warframe.com/w/Warframes

## Данные

- [ ] **Скрытые Expert/Intermediate-версии модов в WFCD** (одноимённые, на вики их нет): пропущены, список в `tools/unparsed.md`.
- [ ] **`FireRate = math.huge`** в данных оружия вики (мгновенный выстрел) записан как `1e9`.
