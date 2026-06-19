# Autonomous Risk Guardian

## Сущности

- [offchain] ML модель по оценке риска
- [onchain] код-пакет на Sui
- [protocol] лендинг протокол

## Описание роли сущностей

### offchain: ML

Обученная ML модель оценивает текущее состояние рынка. На выходе:

- AI risk score (for dashboard)
- max_ltv, %
- borrow_cap, %

Liq_buffer не трогаем, так как тогда агент может навредить.

Шлем ParamRequest в onchain когда:

- clamp(target) жестче current
- ИЛИ каждые 5 минут

### offchain: keeper

Каждые 5 минут вызывает функцию в onchain для расчета div_own без параметров от offchain агента. В конце обновляется last_check.

### onchain

Запускается с параметрами от offchain агента, либо без.

```text
agent_req = данные от агента (optional)
div_own = f(divergence[Pyth<>DeepBook], depth DeepBook)  // функцию предстоит уточнить, она с coin_decimal фактором
      If divergence >= X% , is_frozen=true
      else if depth DeepBook != ok, is_frozen=true
      else calculate onchain_own(div_own)  // считаем параметр через ончейн

desired = tighter_of( clamp(agent_req,floor,baseline), clamp(onchain_own,floor,baseline) )  // если agent_req отсутствует в вызове, выполняем без него
      if desired жёстче current, тогда  current = desired  // ужимаемся мгновенно
      else, тогда шаг к desired на 1 ступень  // только если all-clear держится, разжимаемся медленно и сами

last_check = now
```

### protocol

Реализуем inline расчет. Когда вызываем borrow или withdraw_collateral, запускаем расчет через код-пакет onchain без параметров.

Результаты записываем в GuardianPolicy и используем. Если is_frozen , то транзакция отклоняется. Если новые max_ltv или borrow_cap того требуют, транзакция отклоняется.

## Рамки безопасности

### Ограничения при состоянии freeze

Замораживаем:

- borrow
- withdraw_collateral

### Выход из состояния freeze

Никто кроме DAO/owner не может разблокировать протокол

### Ограниченное доверие к offchain-агенту

1. Согласно разделу onchain → «С параметрами» мы меняем настройки в GuardianPolicy только в более безопасную сторону
2. Ужимание – мгновенно и по tighter_of. Разжимание – по капле.

Каждые 10 минут снижаем безопасность настроек, если нет причин делать строже.

### Ручное вмешательство

1. Если протокол заморожен, ограничения может снять только DAO/owner
2. DAO/owner могут менять рамки [baseline ; cap] для параметров, то есть менять min-max значения

### Децентрализация

1. Любой протокол может поднять собственного offchain агента
2. При взаимодействии с код-пакетом протокол может менять только собственный GuardianPolicy, защита от злоумышленников, только авторизованные изменения

### Прочее по безопасности

Помимо last_check необходимо фиксировать last_change. Это позволит знать последний relax/freeze и рассчитывать timeout.

## Why Sui?

- PTB-атомарность
- Move capability/ownership (на уровне типов)
- Нативный CLOB DeepBook
