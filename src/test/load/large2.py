from locust import HttpLocust, TaskSet, task

from hubTasks import HubTasks
from hubUser import HubUser
from largeTasks import LargeTasks


# locust -f large.py --host=http://localhost:8080

class LargeUser2(HubUser):
    def name(self):
        return "large_test_2"

    def number(self, suggested):
        return 2

    def start_channel(self, payload, tasks):
        pass

    def start_webhook(self, config):
        pass

    def has_webhook(self):
        return False

    def has_websocket(self):
        return False


class LargeTasks1(TaskSet):
    hubTasks = None
    first = True

    def on_start(self):
        user = LargeUser2()
        self.hubTasks = HubTasks(user, self.client)
        self.hubTasks.start()
        self.largeTasks = LargeTasks(user, self.hubTasks)

    @task(100)
    def write(self):
        self.largeTasks.write()


class WebsiteUser(HttpLocust):
    task_set = LargeTasks1
    min_wait = 5000
    max_wait = 30000

    def __init__(self):
        super(WebsiteUser, self).__init__()
        HubTasks.host = self.host
