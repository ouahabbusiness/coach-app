// Réponses locales quand aucune clé n'est configurée. Toujours annoncées comme démo :
// on ne fait jamais passer une règle déterministe pour une réponse d'IA.

import type { IppoContext } from './types';

const kg = (v: number) => v.toLocaleString('fr-BE', { maximumFractionDigits: 1 });

export function welcomeMessage(ctx: IppoContext): string {
  const parts: string[] = [];
  if (ctx.profile.weightKg !== null) parts.push(`poids ${kg(ctx.profile.weightKg)} kg`);
  if (ctx.goal?.main) parts.push(`objectif ${ctx.goal.main.toLowerCase()}`);
  if (ctx.sessions[0]) parts.push(`dernière séance : ${ctx.sessions[0].title}`);
  return [
    'Salut Hmidou, moi c’est Ippo.',
    parts.length ? `Ce que je vois : ${parts.join(' · ')}.` : 'Je n’ai pas encore assez de données pour te lire.',
    'Demande-moi une analyse, une adaptation de séance ou un ajustement nutrition. Je te dirai toujours quand une donnée me manque.',
  ].join(' ');
}

export function demoAnswer(question: string, ctx: IppoContext): string {
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const head = 'Mode démo : aucune IA n’est connectée. Voici ce que les données réelles de l’app disent.';

  if (/douleur|mal|bless|poignet|epaule|coude|genou|dos/.test(q)) {
    const pain = ctx.safety.pains ? `Tu as déclaré : « ${ctx.safety.pains} ». ` : '';
    return `${head}\n\n${pain}Je ne fais pas de diagnostic. Si la douleur est vive, nouvelle ou qu’elle dure, arrête le mouvement et consulte un professionnel de santé. En attendant : pas de charge lourde sur la zone, garde une marge de 3 répétitions, et note ce qui la déclenche.`;
  }

  if (/poids|gras|maigrir|secher|balance/.test(q)) {
    if (ctx.weight.latestKg === null) return `${head}\n\nJe n’ai aucune pesée enregistrée : je ne peux pas parler de tendance. Pèse-toi demain à jeun et note-le dans l’app.`;
    const trend =
      ctx.weight.trend === 'données insuffisantes'
        ? 'la tendance demande encore des pesées (3 par semaine environ)'
        : `tendance ${ctx.weight.trend}${ctx.weight.deltaKg !== null ? ` (${ctx.weight.deltaKg > 0 ? '+' : ''}${ctx.weight.deltaKg} kg sur 2 semaines)` : ''}`;
    return `${head}\n\nDernière pesée : ${kg(ctx.weight.latestKg)} kg le ${ctx.weight.latestDay}. Sur 2 semaines : ${trend}. Je ne recommande ni sèche agressive ni saut de repas : on ajuste d’abord les protéines et la régularité, puis on regarde la moyenne sur 3 semaines.`;
  }

  if (/nutrition|manger|repas|calorie|proteine|dejeuner|diner/.test(q)) {
    if (ctx.nutrition.todayKcal === null) return `${head}\n\nLes apports du jour ne sont pas renseignés : je ne les invente pas. Note ton petit-déjeuner et ton déjeuner, puis redemande-moi.`;
    const complete = ctx.nutrition.todayComplete === false ? ' (journée incomplète, total inconnu)' : '';
    return `${head}\n\nAujourd’hui : ${ctx.nutrition.todayKcal} kcal documentées${complete}${ctx.nutrition.todayProteinG !== null ? `, ${ctx.nutrition.todayProteinG} g de protéines documentées` : ''}. Règle simple : une source de protéines à chaque repas, des légumes, et un féculent autour de la séance. Si tu veux un ajustement précis, il me manque le détail des repas.`;
  }

  if (/materiel|achete|equipement|kettlebell|haltere|barre/.test(q)) {
    const eq = ctx.equipment;
    const items = eq.items.length ? eq.items.join(', ') : 'aucun matériel renseigné';
    return `${head}\n\nMatériel connu : ${items}. Kettlebells : ${eq.kettlebells.length ? eq.kettlebells.join(', ') + ' kg' : 'inconnues'}. Lest : ${eq.loadPieces.length ? eq.loadPieces.join(' + ') + ' kg' : 'inconnu'}. Dis-moi ce que tu viens d'acheter et je l'intègre ; Ippo s'en sert pour te conseiller sans te faire racheter ce que tu as déjà.`;
  }

  if (/seance|entrainement|programme|muscle|traction|stagn|progres|repos/.test(q)) {
    const last = ctx.sessions[0];
    if (!last) return `${head}\n\nAucune séance enregistrée : je ne peux pas analyser ta progression. Lance la première séance, puis reviens.`;
    const done = last.doneSets !== null && last.workSets !== null ? ` (${last.doneSets}/${last.workSets} séries de travail)` : '';
    return `${head}\n\nDernière séance : ${last.title}, ${last.day}, ${last.outcome}${done}. ${ctx.program ? `Programme en cours : ${ctx.program.title}.` : 'Aucun programme validé.'} Pour progresser, on ne change pas de programme : on ajoute une répétition ou 2,5 kg quand toutes les séries sont propres, et on garde 2 répétitions en réserve.`;
  }

  return `${head}\n\nJe peux déjà te dire : ${ctx.sessions.length ? `${ctx.sessions.length} séances récentes, ` : ''}${ctx.profile.weightKg !== null ? `${kg(ctx.profile.weightKg)} kg, ` : ''}${ctx.goal?.main ? `objectif ${ctx.goal.main.toLowerCase()}` : 'objectif non renseigné'}. Pose-moi une question sur ta séance, ton poids ou tes repas.`;
}
