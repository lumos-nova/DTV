package huya

import (
	"context"
	"testing"
)

func TestDanmakuManagerStopsRoomsIndependently(t *testing.T) {
	manager := NewDanmakuManager(nil)
	for _, roomID := range []string{"100", "200"} {
		_, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		close(done)
		manager.sessions[roomID] = &danmakuSession{
			roomID: roomID,
			cancel: cancel,
			done:   done,
		}
	}
	manager.refs["200"] = 2

	manager.Stop("100")
	if _, ok := manager.sessions["100"]; ok {
		t.Fatal("stopped room remains registered")
	}
	if _, ok := manager.sessions["200"]; !ok {
		t.Fatal("stopping one room removed another room")
	}
	manager.Stop("200")
	if manager.refs["200"] != 1 {
		t.Fatal("stopping one subscription removed the room's remaining reference")
	}

	manager.StopAll()
	if len(manager.sessions) != 0 {
		t.Fatalf("StopAll left %d sessions", len(manager.sessions))
	}
}
