import { useGame } from '../../game/GameContext';

export default function TasksPanel() {
  const { state, dispatch } = useGame();

  return (
    <div className="panel-content">
      <h2 className="panel-title">📜 每日任務</h2>
      <div className="tasks-list">
        {state.tasks.map(task => (
          <div key={task.id} className={`task-row ${task.done ? 'task-row--done' : ''} ${task.claimed ? 'task-row--claimed' : ''}`}>
            <span className="task-check">{task.claimed ? '🎁' : task.done ? '✅' : '⬜'}</span>
            <span className="task-name">{task.name}</span>
            <span className="task-reward">
              {task.reward.coins > 0 ? `+${task.reward.coins} 金幣` : ''}
              {task.reward.crystals > 0 ? `+${task.reward.crystals} 水晶` : ''}
            </span>

            {/* 已完成 + 尚未領取 → 顯示領取按鈕 */}
            {task.done && !task.claimed && (
              <button
                className="task-claim-btn"
                onClick={() => dispatch({ type: 'CLAIM_TASK_REWARD', taskId: task.id })}
              >
                領取
              </button>
            )}

            {/* 已領取 → 顯示灰色標籤 */}
            {task.claimed && (
              <span className="task-claimed-tag">已領取</span>
            )}
          </div>
        ))}
      </div>
      <p className="panel-note">完成任務後點擊「領取」即可獲得獎勵，每日午夜重置。</p>
    </div>
  );
}
