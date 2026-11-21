export async function renderProfile(root) {
  root.innerHTML = `
    <section class="space-y-4">
      <div class="card-soft space-y-3">
        <h2 class="text-lg font-semibold">Подписка</h2>
        <p class="text-sm text-soil-700/80">Учёт сейчас открыт без оплаты. Статус подписки будет показан здесь.</p>
      </div>

      <div class="card-soft space-y-3">
        <h2 class="text-lg font-semibold">Обучение</h2>
        <ul class="space-y-3 text-sm text-soil-700/80">
          <li>На главной создаются продажа, закупка и расходник.</li>
          <li>В истории операции можно отфильтровать, изменить или удалить.</li>
          <li>В отчётах видны выручка и затраты. Линию прибыли на графике можно включить отдельно.</li>
          <li>В разделе «Ассортимент» весь список позиций и групп. Правка названия и группы сразу видна в операциях и отчётах.</li>
        </ul>
      </div>

      <div class="card-soft space-y-1">
        <h2 class="text-lg font-semibold">Аккаунт</h2>
        <p class="text-sm text-soil-700/80">Выйти из аккаунта</p>
        <p class="text-sm text-soil-700/60">Пока это только подпись: выход ещё не подключён.</p>
      </div>
    </section>
  `;
}
